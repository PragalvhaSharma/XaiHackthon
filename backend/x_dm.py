import json
from typing import Dict, Any, Optional
from xdk import Client as XClient
from xai_sdk import Client as XAIClient
from xai_sdk.chat import user, system


PRAGALVHA_X_USER_ID = ""

class XDirectMessaging:
    def __init__(self, xai_client: XAIClient, x_client: Optional[XClient] = None):
        """
        Initialize the direct messaging handler.
        
        Args:
            xai_client: xAI client for generating personalized messages
            x_client: X (Twitter) API client for sending DMs (optional)
        """
        self.xai_client = xai_client
        self.x_client = x_client

    def _generate_interview_offer(
        self,
        candidate_data: Dict[str, Any],
        job_description: str,
        company_name: str,
        recruiter_name: str,
        test_link: str = None
    ) -> Dict[str, Any]:
        """
        Generate a personalized interview offer message for a candidate.
        
        Args:
            candidate_data: The candidate's profile data including user info, tweets, and evaluation
            job_description: The job description
            company_name: Name of the hiring company
            recruiter_name: Name of the recruiter sending the message
            test_link: Link to an assessment/test for the candidate to take
            
        Returns:
            Dict with 'message' (str) and 'subject' (str) for the outreach
        """
        chat = self.xai_client.chat.create(model="grok-4")
        
        user_info = candidate_data.get('user', {})
        tweets = candidate_data.get('tweets', [])
        evaluation = candidate_data.get('evaluation', {})
        found_via_keyword = candidate_data.get('found_via_keyword', '')
        
        # Format recent tweets for context
        tweets_sample = "\n".join([f"- {tweet}" for tweet in tweets])
        
        public_metrics = user_info.get('public_metrics', {})

        chat.append(system(f"""
        You are an expert technical recruiter crafting personalized outreach messages.
        
        Your task is to write a compelling, personalized direct message (DM) to a potential candidate
        inviting them to interview for a position. The message should:
        
        1. Be warm, professional, and NOT generic - reference specific things from their profile/tweets
        2. Be concise but complete - can be longer than a typical tweet if needed
        3. Mention why YOU reached out to THEM specifically (based on their expertise/tweets)
        4. Include a clear call-to-action
        5. Not be pushy or salesy - be genuine and respectful of their time
        6. Not use excessive flattery or buzzwords
        7. Include the assessment link naturally in the message - invite them to take a quick assessment
           Assessment Link: {test_link}
           Frame it positively (e.g., "If you're interested, here's a quick assessment to get started") if the link is provided.

        Respond with ONLY a JSON object with these exact keys:
        {{
            "subject": "Brief subject/opening hook (optional, for email-style DMs)",
            "message": "The full personalized message"
        }}
        
        No markdown, no explanation outside the JSON.
        """))
        
        chat.append(user(f"""
        Candidate Profile:
        - Username: @{user_info.get('username', 'N/A')}
        - Name: {user_info.get('name', 'N/A')}
        - Bio: {user_info.get('description', 'No bio')}
        - Followers: {public_metrics.get('followers_count', 0)}
        - Found via keyword: {found_via_keyword}
        
        Why they're a good fit (from our evaluation):
        {evaluation.get('reason', 'Matches job requirements')}
        
        Recent Tweets (for personalization):
        {tweets_sample if tweets_sample else "No tweets available"}
        
        Job Details:
        - Company: {company_name}
        - Recruiter: {recruiter_name}
        - Job Description: {job_description}
        
        Write a personalized interview invitation DM for this candidate.
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
            username = user_info.get('username', 'unknown')
            print(f"Generated interview offer for @{username}")
            return {
                "success": True,
                "username": username,
                "user_id": user_info.get('id'),
                "subject": result.get('subject', ''),
                "message": result.get('message', '')
            }
        except (json.JSONDecodeError, Exception) as e:
            print(f"Error generating interview offer: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def _send_dm(self, user_id: str, message: str) -> Dict[str, Any]:
        """
        Send a direct message to a user on X.
        
        Args:
            user_id: The X user ID to send the DM to
            message: The message content
            
        Returns:
            Dict with success status and any response data
        """
        if not self.x_client:
            print("X client not configured")
            return {"success": False, "error": "X client not configured"}

        try:
            # todo: hardcoded pragalvha's user ID. Can be sent to the actual user in prod.
            # Note: DM API requires specific permissions (dm.write scope)
            # See: https://docs.x.com/xdks/python/reference/xdk.direct_messages.client
            # Pass a dict directly since the XDK's Pydantic models are empty
            response = self.x_client.direct_messages.create_by_participant_id(
                participant_id=PRAGALVHA_X_USER_ID,
                body={"text": message}
            )
            print(f"DM sent to user {user_id}")
            return {
                "success": True,
                "response": response
            }
        except Exception as e:
            print(f"Error sending DM to {user_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def generate_and_send(
        self,
        candidate_data: Dict[str, Any],
        job_description: str,
        company_name: str,
        recruiter_name: str,
        test_link: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a personalized message and optionally send it.
        
        Args:
            candidate_data: The candidate's profile data
            job_description: The job description
            company_name: Name of the hiring company
            recruiter_name: Name of the recruiter
            test_link: Optional link to an assessment/test for the candidate
            
        Returns:
            Dict with generated message and send status
        """
        # Generate the personalized message
        offer = self._generate_interview_offer(
            candidate_data=candidate_data,
            job_description=job_description,
            company_name=company_name,
            recruiter_name=recruiter_name,
            test_link=test_link
        )
        
        if not offer.get('success'):
            return offer

        user_id = offer.get('user_id')
        if user_id:
            print(f"Sending DM to user {user_id}")

            send_result = self._send_dm(user_id, offer['message'])
            offer['sent'] = send_result.get('success', False)
            if not send_result.get('success'):
                offer['send_error'] = send_result.get('error')
        else:
            print(f"No user ID available for {candidate_data}")
            offer['sent'] = False
            offer['send_error'] = "No user ID available"
        
        return offer
