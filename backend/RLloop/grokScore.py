import os
from typing import Optional
from pydantic import BaseModel, Field
from xai_sdk import Client
from xai_sdk.chat import user, system
from dotenv import load_dotenv

# Import RL feedback functions for self-improving scoring
from RLloop.rl_feedback import compute_calibration_metrics, get_policy_stats

load_dotenv()

# Pydantic Schema
class CandidateScore(BaseModel):
    score: int = Field(description="Candidate score from 0-100", ge=0, le=100)


def get_calibration_context(job_id: Optional[str]) -> str:
    """
    Generate calibration context from RL feedback to inject into the prompt.
    
    This is the key to self-improving AI - we learn from recruiter feedback
    and tell Grok to adjust its scoring based on historical patterns.
    
    Args:
        job_id: Job identifier to get calibration for
        
    Returns:
        String to append to system prompt with calibration guidance
    """
    if not job_id:
        return ""
    
    try:
        metrics = compute_calibration_metrics(job_id)
        stats = get_policy_stats(job_id)
        
        if not metrics or metrics.get('sample_count', 0) < 2:
            return ""  # Not enough data yet
        
        bias = metrics.get('bias', 0)
        mae = metrics.get('mae', 0)
        sample_count = metrics.get('sample_count', 0)
        
        # Generate calibration guidance based on learned patterns
        calibration_text = f"""

IMPORTANT - CALIBRATION FROM RECRUITER FEEDBACK:
Based on {sample_count} recruiter reviews for this role:"""
        
        if abs(bias) > 5:
            if bias > 0:
                calibration_text += f"""
- You have been UNDERRATING candidates by ~{abs(bias):.0f} points on average
- Recruiters consistently rate candidates higher than your predictions
- Adjust your scores UPWARD to better match recruiter expectations"""
            else:
                calibration_text += f"""
- You have been OVERRATING candidates by ~{abs(bias):.0f} points on average
- Recruiters consistently rate candidates lower than your predictions
- Be MORE CRITICAL and adjust your scores DOWNWARD"""
        
        if mae > 15:
            calibration_text += f"""
- Your average error is {mae:.0f} points - aim for more accurate predictions
- Consider the specific requirements more carefully"""
        
        # Add confidence indicator
        if stats and stats.get('weight', 1) < 0.5:
            calibration_text += """
- Model confidence is LOW - be especially thoughtful in your evaluation"""
        
        return calibration_text
        
    except Exception as e:
        print(f"Error getting calibration context: {e}")
        return ""


def rank_candidate(
    candidate_description: str, 
    job_requirements: str,
    job_id: Optional[str] = None
) -> CandidateScore:
    """
    Ranks a candidate based on their description against job requirements.
    
    Uses RL feedback from recruiter reviews to self-improve scoring accuracy.
    
    Args:
        candidate_description: Information about the candidate (skills, experience, background, etc.)
        job_requirements: The job requirements and criteria
        job_id: Optional job ID to load calibration data for self-improving scoring
        
    Returns:
        CandidateScore object with score field (0-100)
    """
    client = Client(api_key=os.getenv("XAI_API_KEY"))
    chat = client.chat.create(model="grok-4")
    
    # Get calibration context from RL feedback (self-improving!)
    calibration_context = get_calibration_context(job_id)
    
    system_prompt = f"""You are an expert technical recruiter and hiring manager. 
Your task is to evaluate candidates against job requirements and provide a numerical score.

Scoring criteria:
- 90-100: Exceptional fit, exceeds requirements
- 75-89: Strong fit, meets all key requirements
- 60-74: Good fit, meets most requirements with minor gaps
- 40-59: Moderate fit, has relevant experience but significant gaps
- 20-39: Poor fit, lacks many key requirements
- 0-19: Not qualified for this role

Be thorough, fair, and objective in your evaluation.{calibration_context}"""

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