import os
from pydantic import BaseModel, Field
from xai_sdk import Client
from xai_sdk.chat import user, system
from dotenv import load_dotenv

load_dotenv()

# Pydantic Schema
class CandidateScore(BaseModel):
    score: int = Field(description="Candidate score from 0-100", ge=0, le=100)

def rank_candidate(candidate_description: str, job_requirements: str) -> CandidateScore:
    """
    Ranks a candidate based on their description against job requirements.
    
    Args:
        candidate_description: Information about the candidate (skills, experience, background, etc.)
        job_requirements: The job requirements and criteria
        
    Returns:
        CandidateScore object with score field (0-100)
    """
    client = Client(api_key=os.getenv("XAI_API_KEY"))
    chat = client.chat.create(model="grok-4")
    
    system_prompt = """You are an expert technical recruiter and hiring manager. 
Your task is to evaluate candidates against job requirements and provide a numerical score.

Scoring criteria:
- 90-100: Exceptional fit, exceeds requirements
- 75-89: Strong fit, meets all key requirements
- 60-74: Good fit, meets most requirements with minor gaps
- 40-59: Moderate fit, has relevant experience but significant gaps
- 20-39: Poor fit, lacks many key requirements
- 0-19: Not qualified for this role

Be thorough, fair, and objective in your evaluation."""

    user_prompt = f"""Please evaluate this candidate for the given job requirements and provide a score from 0-100:

JOB REQUIREMENTS:
{job_requirements}

CANDIDATE DESCRIPTION:
{candidate_description}"""

    chat.append(system(system_prompt))
    chat.append(user(user_prompt))
    
    # The parse method returns a tuple of the full response object as well as the parsed pydantic object
    response, candidate_score = chat.parse(CandidateScore)
    
    return candidate_score


if __name__ == "__main__":
    # Example usage
    sample_candidate = """
    John Doe
    - 5 years of Python development experience
    - Strong background in machine learning and AI
    - Experience with FastAPI, Django, Flask
    - Worked at tech startups
    - BS in Computer Science
    """
    
    sample_job = """
    Senior Python Developer
    Requirements:
    - 5+ years Python experience
    - Experience with web frameworks (FastAPI/Django)
    - Machine learning knowledge
    - Team leadership experience
    - MS degree preferred
    """
    
    result = rank_candidate(sample_candidate, sample_job)
    assert isinstance(result, CandidateScore)
    print(f"\nCandidate Score: {result.score}/100") 