"""
FastAPI Application for RL Recruiter System

This API provides endpoints for:
- Processing recruiter feedback
- Getting policy statistics
- Viewing reward history
- Computing calibration metrics
- Scoring candidates with AI
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import sys
from pathlib import Path

# Add RLloop to path
sys.path.append(str(Path(__file__).parent / "RLloop"))

from backend.RLloop import rl_feedback, grokScore

app = FastAPI(
    title="RL Recruiter API",
    description="Reinforcement Learning powered candidate scoring system",
    version="1.0.0"
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Request/Response Models ====================

class FeedbackRequest(BaseModel):
    """Request model for submitting recruiter feedback"""
    candidate_id: str = Field(..., description="Unique candidate identifier")
    job_id: str = Field(..., description="Job identifier")
    ai_score: int = Field(..., ge=0, le=100, description="AI-generated score (0-100)")
    recruiter_stars: int = Field(..., ge=1, le=5, description="Recruiter rating (1-5 stars)")
    version: int = Field(1, description="Policy version")


class FeedbackResponse(BaseModel):
    """Response model for feedback submission"""
    candidate_id: str
    job_id: str
    ai_score: int
    recruiter_score: int
    delta: int
    reward_id: int
    message: str


class ScoreRequest(BaseModel):
    """Request model for scoring a candidate"""
    candidate_description: str = Field(..., description="Candidate information (resume, skills, etc.)")
    job_requirements: str = Field(..., description="Job requirements and criteria")


class ScoreResponse(BaseModel):
    """Response model for candidate scoring"""
    score: int = Field(..., ge=0, le=100, description="Candidate score (0-100)")


class PolicyStatsResponse(BaseModel):
    """Response model for policy statistics"""
    job_id: str
    version: int
    weight: float
    error_avg: float
    sample_count: int
    created_at: int


class CalibrationMetricsResponse(BaseModel):
    """Response model for calibration metrics"""
    job_id: str
    sample_count: int
    mae: Optional[float]
    bias: Optional[float]
    rmse: Optional[float]


class RewardLogEntry(BaseModel):
    """Single reward log entry"""
    id: int
    candidate_id: str
    job_id: str
    ai_score: int
    recruiter_score: int
    delta: int
    created_at: int


# ==================== Health Check ====================

@app.get("/", tags=["Health"])
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "RL Recruiter API",
        "version": "1.0.0"
    }


# ==================== RL Feedback Endpoints ====================

@app.post("/api/feedback", response_model=FeedbackResponse, tags=["Feedback"])
async def submit_feedback(feedback: FeedbackRequest):
    """
    Submit recruiter feedback for a candidate.
    
    This endpoint processes recruiter feedback and updates the RL policy:
    1. Stores the AI score
    2. Converts star rating to 0-100 score
    3. Computes delta (error)
    4. Logs reward signal
    5. Updates policy state with RL learning
    
    Returns:
        Feedback results including delta and updated policy
    """
    try:
        result = rl_feedback.process_feedback(
            candidate_id=feedback.candidate_id,
            job_id=feedback.job_id,
            ai_score=feedback.ai_score,
            recruiter_stars=feedback.recruiter_stars,
            version=feedback.version
        )
        
        return FeedbackResponse(
            candidate_id=result['candidate_id'],
            job_id=result['job_id'],
            ai_score=result['ai_score'],
            recruiter_score=result['recruiter_score'],
            delta=result['delta'],
            reward_id=result['reward_id'],
            message="Feedback processed successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.get("/api/policy/{job_id}", response_model=PolicyStatsResponse, tags=["Policy"])
async def get_policy_stats(
    job_id: str,
    version: int = Query(1, description="Policy version")
):
    """
    Get current policy statistics for a job.
    
    Returns the RL policy state including:
    - Trust weight (0-1): How much to trust AI scores
    - Average error: Mean absolute error
    - Sample count: Number of feedback samples
    
    Args:
        job_id: Job identifier
        version: Policy version (default: 1)
    """
    try:
        stats = rl_feedback.get_policy_stats(job_id, version)
        
        if stats is None:
            raise HTTPException(
                status_code=404, 
                detail=f"No policy found for job_id '{job_id}' with version {version}"
            )
        
        return PolicyStatsResponse(**stats)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.get("/api/rewards/{job_id}", response_model=list[RewardLogEntry], tags=["Rewards"])
async def get_reward_history(
    job_id: str,
    limit: int = Query(50, ge=1, le=500, description="Maximum number of records to return")
):
    """
    Get recent reward history for a job.
    
    Returns a list of feedback entries showing:
    - AI scores vs recruiter scores
    - Deltas (errors)
    - Timestamps
    
    Args:
        job_id: Job identifier
        limit: Maximum number of records (default: 50, max: 500)
    """
    try:
        history = rl_feedback.get_reward_history(job_id, limit)
        return [RewardLogEntry(**entry) for entry in history]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.get("/api/calibration/{job_id}", response_model=CalibrationMetricsResponse, tags=["Metrics"])
async def get_calibration_metrics(job_id: str):
    """
    Compute model calibration metrics for a job.
    
    Returns:
    - MAE (Mean Absolute Error): Average magnitude of error
    - Bias: Systematic over/underrating (negative = overrating)
    - RMSE (Root Mean Squared Error): Penalizes large errors
    - Sample count: Number of feedback samples
    
    Args:
        job_id: Job identifier
    """
    try:
        metrics = rl_feedback.compute_calibration_metrics(job_id)
        return CalibrationMetricsResponse(**metrics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ==================== Scoring Endpoints ====================

@app.post("/api/score", response_model=ScoreResponse, tags=["Scoring"])
async def score_candidate(request: ScoreRequest):
    """
    Score a candidate using AI (Grok).
    
    This endpoint evaluates a candidate against job requirements
    using an LLM and returns a score from 0-100.
    
    Scoring criteria:
    - 90-100: Exceptional fit, exceeds requirements
    - 75-89: Strong fit, meets all key requirements
    - 60-74: Good fit, meets most requirements with minor gaps
    - 40-59: Moderate fit, has relevant experience but significant gaps
    - 20-39: Poor fit, lacks many key requirements
    - 0-19: Not qualified for this role
    
    Args:
        candidate_description: Candidate information (resume, skills, etc.)
        job_requirements: Job requirements and criteria
    """
    try:
        result = grokScore.rank_candidate(
            candidate_description=request.candidate_description,
            job_requirements=request.job_requirements
        )
        
        return ScoreResponse(score=result.score)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")


# ==================== Batch Operations ====================

@app.get("/api/jobs/{job_id}/summary", tags=["Summary"])
async def get_job_summary(job_id: str, version: int = Query(1, description="Policy version")):
    """
    Get a complete summary for a job including policy stats and calibration metrics.
    
    This is a convenience endpoint that combines multiple queries into one response.
    """
    try:
        policy_stats = rl_feedback.get_policy_stats(job_id, version)
        calibration = rl_feedback.compute_calibration_metrics(job_id)
        
        if policy_stats is None:
            return {
                "job_id": job_id,
                "status": "no_data",
                "message": "No feedback data available for this job",
                "calibration": calibration
            }
        
        return {
            "job_id": job_id,
            "status": "active",
            "policy": policy_stats,
            "calibration": calibration,
            "trust_level": (
                "high" if policy_stats['weight'] >= 0.8 else
                "medium" if policy_stats['weight'] >= 0.6 else
                "low"
            )
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)