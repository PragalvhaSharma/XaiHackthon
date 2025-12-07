import os
import json
from typing import Dict, Any
from xai_sdk import Client
from xai_sdk.chat import user, system
from dotenv import load_dotenv

load_dotenv()

client = Client(
    api_key=os.getenv('XAI_API_KEY'),
)

def analyze_profile_for_job(profile_data: Dict[str, Any], job_desc: str) -> str:
    """
    Analyze user's X profile and tweets for relevance to job description using xAI Grok.
    """
    if not profile_data:
        return "No profile data available."

    user_info = profile_data.get('user', {})
    tweets = profile_data.get('tweets', [])

    chat = client.chat.create(model="grok-4")

    chat.append(system("""
    - You are a technical recruiter.
    - Analyze this X (Twitter) user's profile and recent tweets for relevance to the following job description.
    - Make sure to respond back in valid json, it should contain: "score", "analysis" as keys
    - "score" should be a value between 1-10 and "analysis" should be your analysis on the candidate's fit for the job
    """))
    chat.append(system(f"""
    Job Description:
    {job_desc}

    User Profile:
    - Name: {user_info.get('name', 'N/A')}
    - Username: @{user_info.get('username', 'N/A')}
    - Bio: {user_info.get('description', 'No bio')}
    - Verified: {user_info.get('verified', False)}
    - Followers: {user_info.get('followers_count', 0)}
    - Profile link: {user_info.get('profile_link', 'N/A')}

    Recent Tweets:
    {chr(10).join([f"- {tweet}" for tweet in tweets])}

    Provide a structured analysis:
    1. Relevance score: 0-10 (10 being perfect match)
    2. Key matching skills/experience from profile/tweets
    3. Reasons for score (strengths and gaps)
    4. Overall recommendation: Strong fit / Good fit / Possible fit / Not a fit

    Be objective and base analysis on visible evidence from profile and tweets.
    """))

    try:
        analysis_text = chat.sample().content
        print(f"Analysis text: {analysis_text}")

        analysis_json = json.loads(analysis_text)
        return analysis_json
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Error parsing JSON analysis: {e}, falling back to text")
        return {"score": 0, "analysis": analysis_text, "error": "Parse failed"}
