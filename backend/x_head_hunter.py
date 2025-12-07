import json
from typing import Dict, List, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from xdk import Client as XClient
from xai_sdk import Client as XAIClient
from xai_sdk.chat import user, system


USER_SEARCH_WORKERS = 8
USER_TWEETS_WORKERS = 4
USER_EVAL_WORKERS = 20

class XHeadHunter:
    def __init__(self, job_description: str, x_client: XClient, xai_client: XAIClient):
        """
        Initialize the head hunter with a job description and API clients.
        
        Args:
            job_description: The job description to find candidates for
            x_client: X (Twitter) API client for searching users/tweets
            xai_client: xAI client for Grok analysis
        """
        self.job_description = job_description
        self.x_client = x_client
        self.xai_client = xai_client

    def _generate_keywords(self) -> List[str]:
        """
        Use Grok to generate relevant keywords people would use in Twitter posts
        about work related to the job description.
        """
        chat = self.xai_client.chat.create(model="grok-4-fast")
        
        chat.append(system("""
        You are an expert at understanding job descriptions and social media behavior.
        Given a job description, generate a list of keywords and phrases that professionals
        in this field would likely use in their Twitter/X posts when sharing their work,
        achievements, or thoughts related to this domain.
        
        Focus on:
        - Technical terms and technologies mentioned
        - Industry-specific hashtags (without the #)
        - Common phrases professionals use when sharing work
        - Skills and tools relevant to the role
        
        Respond with ONLY a JSON array of strings containing 3-5 relevant keywords/phrases.
        No markdown, no explanation, just the JSON array.
        """))
        
        chat.append(user(f"""
        Job Description:
        {self.job_description}
        """))
        
        try:
            response = chat.sample().content.strip()
            
            # Clean up response in case it has markdown code blocks
            if response.startswith("```"):
                lines = response.split("\n")
                response = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
                if response.startswith("json"):
                    response = response[4:].strip()
            
            keywords = json.loads(response)
            print(f"Generated {len(keywords)} keywords: {keywords}")
            return keywords
        except (json.JSONDecodeError, Exception) as e:
            print(f"Error generating keywords: {e}")
            return []

    def _search_users_by_keyword(self, keyword: str) -> List[Dict[str, Any]]:
        """
        Search for users who have posted about a specific keyword.
        Returns a list of user profile dictionaries.
        
        Note: Uses recent search (last 7 days) as full-archive search
        requires Pro/Enterprise access.
        """
        users = []
        try:
            # Search for recent tweets containing the keyword
            # Using search_recent instead of search_all (which requires Pro/Enterprise)
            # Request author_id in tweet fields and expand author info
            # Note: search_recent returns a generator, use next() to get first response
            # Use -is:retweet to exclude retweets (we want original content)
            tweets_response = next(self.x_client.posts.search_recent(
                query=f"{keyword} -is:retweet lang:en",
                max_results=100,
                tweet_fields=["author_id"],
                expansions=["author_id"],
                user_fields=["id", "username", "name", "description", "verified", "public_metrics", "profile_image_url"]
            ))

            print(f"tweets_response kw: {keyword}: {tweets_response}")

            seen_author_ids = set()
            
            # Check if we have includes with user data (from expansions)
            users_from_includes = {}
            if hasattr(tweets_response, 'includes') and tweets_response.includes:
                includes_users = tweets_response.includes.get('users', [])
                for u in includes_users:
                    users_from_includes[u.get('id')] = u
            
            # Process tweets
            if tweets_response.data:
                for tweet in tweets_response.data:
                    author_id = tweet.get('author_id')
                    if not author_id or author_id in seen_author_ids:
                        continue
                    
                    seen_author_ids.add(author_id)
                    
                    # Try to get user from includes first (more efficient)
                    if author_id in users_from_includes:
                        user_data = users_from_includes[author_id].copy()
                        username = user_data.get('username')
                        if username:
                            user_data['profile_link'] = f"https://x.com/{username}"
                        users.append(user_data)
                        print(f"Found user @{username} via keyword '{keyword}'")
                    else:
                        # Fallback: fetch profile individually
                        try:
                            profile = self.x_client.users.get_by_id(
                                id=author_id,
                                user_fields=["id", "username", "name", "description", "verified", "public_metrics", "profile_image_url"]
                            )
                            if profile and profile.data:
                                user_data = profile.data
                                username = user_data.get('username')
                                if username:
                                    user_data['profile_link'] = f"https://x.com/{username}"
                                users.append(user_data)
                                print(f"Found user @{username} via keyword '{keyword}'")
                        except Exception as e:
                            print(f"Error fetching profile for author {author_id}: {e}")
                
        except Exception as e:
            print(f"Error searching for keyword '{keyword}': {e}")

        print(f"Found {len(users)} users for keyword '{keyword}'")

        return users

    def _fetch_user_tweets(self, user_id: str, max_results: int = 50) -> List[str]:
        """
        Fetch recent tweets for a user.
        """
        try:
            tweets_response = next(self.x_client.users.get_posts(
                id=user_id,
                max_results=max_results,
            ))
            
            if tweets_response.data:
                return [tweet["text"] for tweet in tweets_response.data]
        except Exception as e:
            print(f"Error fetching tweets for user {user_id}: {e}")
        
        return []

    def _evaluate_candidate(self, username: str, user_data: Dict[str, Any], tweets: List[str]) -> Dict[str, Any]:
        """
        Use Grok to evaluate if a user is a viable candidate for the job.
        
        Returns:
            Dict with 'is_viable' (bool), 'reason' (str), and 'account_type' (str)
        """
        chat = self.xai_client.chat.create(model="grok-4-fast")
        
        # Format tweets nicely for the LLM
        tweets_text = "\n".join([f"- {tweet}" for tweet in tweets[:30]])  # Limit to 30 tweets
        
        user_info = user_data.get('user', user_data)
        public_metrics = user_info.get('public_metrics', {})
        
        chat.append(system("""
        You are an expert technical recruiter evaluating potential job candidates based on their X (Twitter) profile and tweets.
        
        Your task is to determine:
        1. Is this account a real individual who could be a job candidate? (Filter out: company accounts, bots, news outlets, parody accounts, promotional accounts)
        2. Based on their tweets, does this person appear to be a viable candidate for the given job?
        3. It might not be possible to determine the years of experience or similar fileds of a candidate based on their tweets, so you should take that into consideration when evaluating the candidate.
        
        Respond with ONLY a JSON object with these exact keys:
        {
            "is_viable": true/false,
            "account_type": "individual" | "company" | "bot" | "news" | "other",
            "reason": "Brief explanation of your decision"
        }
        
        No markdown, no explanation outside the JSON.
        """))
        
        chat.append(user(f"""
        Job Description:
        {self.job_description}
        
        Candidate Profile:
        - Username: @{username}
        - Name: {user_info.get('name', 'N/A')}
        - Bio: {user_info.get('description', 'No bio')}
        - Followers: {public_metrics.get('followers_count', 0)}
        - Following: {public_metrics.get('following_count', 0)}
        - Tweet count: {public_metrics.get('tweet_count', 0)}
        
        Recent Tweets:
        {tweets_text if tweets_text else "No tweets available"}
        
        Evaluate this candidate.
        """))
        
        try:
            response = chat.sample().content.strip()
            
            # Clean up response in case it has markdown code blocks
            if response.startswith("```"):
                lines = response.split("\n")
                response = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
                if response.startswith("json"):
                    response = response[4:].strip()
            
            result = json.loads(response)
            print(f"Evaluated @{username}: viable={result.get('is_viable')}, type={result.get('account_type')}, reason={result.get('reason')}")
            return result
        except (json.JSONDecodeError, Exception) as e:
            print(f"Error evaluating candidate @{username}: {e}")
            return {"is_viable": False, "account_type": "unknown", "reason": f"Evaluation error: {e}"}

    def hunt(self) -> Dict[str, Dict[str, Any]]:
        """
        Hunt for potential candidates based on the job description.
        
        Steps:
        1. Use Grok to generate relevant keywords from the job description
        2. Search X API in parallel for users who posted about those keywords
        3. Aggregate all users into a map with username as key
        4. Evaluate each candidate with Grok and filter out non-viable ones
        5. If the candidate is actively looking for a job, give them a slight boost (not too much) towards viability.
        
        Returns:
            Dict mapping username to user profile data (including tweets and evaluation)
        """
        print(f"Starting hunt for job: {self.job_description[:100]}...")
        
        # Step 1: Generate relevant keywords using Grok
        keywords = self._generate_keywords()
        
        if not keywords:
            print("No keywords generated, cannot proceed with hunt.")
            return {}
        
        print(f"Searching for users with {len(keywords)} keywords...")
        
        # Step 2: Search for users in parallel across all keywords
        users_map: Dict[str, Dict[str, Any]] = {}
        
        # Use ThreadPoolExecutor for parallel keyword searches        
        with ThreadPoolExecutor(max_workers=USER_SEARCH_WORKERS) as executor:
            # Submit all keyword searches in parallel
            future_to_keyword = {
                executor.submit(self._search_users_by_keyword, keyword): keyword
                for keyword in keywords
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_keyword):
                keyword = future_to_keyword[future]
                try:
                    users = future.result()
                    for user_data in users:
                        username = user_data.get('username')
                        if username and username not in users_map:
                            users_map[username] = {
                                'user': user_data,
                                'found_via_keyword': keyword,
                                'tweets': []
                            }
                            print(f"Found user @{username} via keyword '{keyword}'")
                except Exception as e:
                    print(f"Error processing results for keyword '{keyword}': {e}")
        
        print(f"Found {len(users_map)} unique users. Fetching their tweets...")
        
        # Step 3: Fetch tweets for all users in parallel
        with ThreadPoolExecutor(max_workers=USER_TWEETS_WORKERS) as executor:
            future_to_username = {
                executor.submit(
                    self._fetch_user_tweets, 
                    users_map[username]['user'].get('id')
                ): username
                for username in users_map
                if users_map[username]['user'].get('id')
            }
            
            for future in as_completed(future_to_username):
                username = future_to_username[future]
                try:
                    tweets = future.result()
                    users_map[username]['tweets'] = tweets
                    print(f"Fetched {len(tweets)} tweets for @{username}")
                except Exception as e:
                    print(f"Error fetching tweets for @{username}: {e}")

        print(f"Evaluating {len(users_map)} candidates...")
        
        # Step 4: Evaluate each candidate with Grok and filter non-viable ones
        viable_candidates: Dict[str, Dict[str, Any]] = {}
        
        with ThreadPoolExecutor(max_workers=USER_EVAL_WORKERS) as executor:
            future_to_username = {
                executor.submit(
                    self._evaluate_candidate,
                    username,
                    users_map[username],
                    users_map[username]['tweets']
                ): username
                for username in users_map
            }
            
            for future in as_completed(future_to_username):
                username = future_to_username[future]
                try:
                    evaluation = future.result()
                    users_map[username]['evaluation'] = evaluation
                    
                    # Only keep viable individual candidates
                    if evaluation.get('is_viable') and evaluation.get('account_type') == 'individual':
                        viable_candidates[username] = users_map[username]
                        print(f"✓ @{username} is a viable candidate")
                    else:
                        print(f"✗ @{username} filtered out: {evaluation.get('reason', 'N/A')}")
                except Exception as e:
                    print(f"Error evaluating @{username}: {e}")

        print(f"Hunt complete. Found {len(viable_candidates)} viable candidates out of {len(users_map)} total.")
        return {
            "viable_candidates": viable_candidates,
            "total_searched": len(users_map),
            "total_viable": len(viable_candidates)
        }
