"""
Unit Tests for RL Feedback System

Run with: pytest test_rl_feedback.py -v
"""

import pytest
import sqlite3
from pathlib import Path
from rl_feedback import (
    compute_delta,
    update_ai_score,
    store_reward,
    update_policy_state,
    process_feedback,
    get_policy_stats,
    compute_calibration_metrics,
    get_reward_history,
    STAR_MAP,
    DB_PATH
)


class TestDeltaComputation:
    """Test delta computation and star mapping."""
    
    def test_star_mapping(self):
        """Test that stars map to correct 0-100 scores."""
        assert compute_delta(50, 5) == (100, 50)  # 5 stars = 100
        assert compute_delta(50, 4) == (75, 25)   # 4 stars = 75
        assert compute_delta(50, 3) == (50, 0)    # 3 stars = 50
        assert compute_delta(50, 2) == (25, -25)  # 2 stars = 25
        assert compute_delta(50, 1) == (0, -50)   # 1 star = 0
    
    def test_overrating(self):
        """Test when AI overrates (delta < 0)."""
        recruiter_score, delta = compute_delta(ai_score=85, recruiter_stars=2)
        assert recruiter_score == 25
        assert delta == -60  # AI overrated by 60 points
    
    def test_underrating(self):
        """Test when AI underrates (delta > 0)."""
        recruiter_score, delta = compute_delta(ai_score=40, recruiter_stars=5)
        assert recruiter_score == 100
        assert delta == 60  # AI underrated by 60 points
    
    def test_calibrated(self):
        """Test when AI is well-calibrated (delta ≈ 0)."""
        recruiter_score, delta = compute_delta(ai_score=75, recruiter_stars=4)
        assert recruiter_score == 75
        assert delta == 0  # Perfect calibration
    
    def test_invalid_stars(self):
        """Test that invalid star ratings raise errors."""
        with pytest.raises(ValueError):
            compute_delta(50, 0)  # Too low
        with pytest.raises(ValueError):
            compute_delta(50, 6)  # Too high


class TestDatabaseOperations:
    """Test database CRUD operations."""
    
    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        """Create test candidates and jobs."""
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        
        # Create test job if doesn't exist
        cur.execute("""
            INSERT OR IGNORE INTO jobs (id, title, team, location, type, created_at)
            VALUES ('test-job-rl', 'Test Engineer', 'Engineering', 'Remote', 'Full-time', strftime('%s','now'))
        """)
        
        # Create test candidate if doesn't exist
        cur.execute("""
            INSERT OR IGNORE INTO candidates (
                id, job_id, name, x, stage, created_at, updated_at
            )
            VALUES (
                'test-candidate-rl', 
                'test-job-rl', 
                'Test Candidate',
                '@testcandidate',
                'discovery',
                strftime('%s','now'),
                strftime('%s','now')
            )
        """)
        
        conn.commit()
        conn.close()
        
        yield
        
        # Cleanup after tests
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute("DELETE FROM reward_log WHERE job_id = 'test-job-rl'")
        cur.execute("DELETE FROM policy_state WHERE job_id = 'test-job-rl'")
        cur.execute("DELETE FROM candidates WHERE id = 'test-candidate-rl'")
        cur.execute("DELETE FROM jobs WHERE id = 'test-job-rl'")
        conn.commit()
        conn.close()
    
    def test_store_reward(self):
        """Test storing reward to database."""
        reward_id = store_reward(
            candidate_id='test-candidate-rl',
            job_id='test-job-rl',
            ai_score=80,
            recruiter_score=50,
            delta=-30
        )
        
        assert reward_id > 0
        
        # Verify it was stored
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute("SELECT * FROM reward_log WHERE id = ?", (reward_id,))
        row = cur.fetchone()
        conn.close()
        
        assert row is not None
        assert row[3] == 80  # ai_score
        assert row[4] == 50  # recruiter_score
        assert row[5] == -30  # delta
    
    def test_update_ai_score(self):
        """Test updating AI score in candidates table."""
        update_ai_score('test-candidate-rl', 88)
        
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute("SELECT score FROM candidates WHERE id = ?", ('test-candidate-rl',))
        score = cur.fetchone()[0]
        conn.close()
        
        assert score == 88


class TestPolicyState:
    """Test RL policy state management."""
    
    @pytest.fixture(autouse=True)
    def setup_test_job(self):
        """Create test job."""
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute("""
            INSERT OR IGNORE INTO jobs (id, title, team, location, type, created_at)
            VALUES ('test-policy-job', 'Policy Test', 'Test', 'Remote', 'Full-time', strftime('%s','now'))
        """)
        conn.commit()
        conn.close()
        
        yield
        
        # Cleanup
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute("DELETE FROM policy_state WHERE job_id = 'test-policy-job'")
        cur.execute("DELETE FROM jobs WHERE id = 'test-policy-job'")
        conn.commit()
        conn.close()
    
    def test_initialize_policy_state(self):
        """Test creating new policy state."""
        update_policy_state('test-policy-job', delta=-20)
        
        stats = get_policy_stats('test-policy-job')
        
        assert stats is not None
        assert stats['job_id'] == 'test-policy-job'
        assert stats['version'] == 1
        assert stats['sample_count'] == 1
        assert stats['error_avg'] == 20.0  # abs(delta)
        assert stats['weight'] > 0
    
    def test_update_policy_state_multiple_times(self):
        """Test policy state updates with multiple samples."""
        # First feedback: large error
        update_policy_state('test-policy-job', delta=-30)
        stats1 = get_policy_stats('test-policy-job')
        
        # Second feedback: small error
        update_policy_state('test-policy-job', delta=5)
        stats2 = get_policy_stats('test-policy-job')
        
        # Weight should increase (error decreased)
        assert stats2['weight'] > stats1['weight']
        assert stats2['sample_count'] == 2
        assert stats2['error_avg'] < stats1['error_avg']  # Error improved
    
    def test_policy_weight_decreases_with_high_error(self):
        """Test that high errors decrease policy weight."""
        # Start with low error
        update_policy_state('test-policy-job', delta=5)
        stats1 = get_policy_stats('test-policy-job')
        
        # Add high error feedback
        update_policy_state('test-policy-job', delta=-50)
        update_policy_state('test-policy-job', delta=-45)
        stats2 = get_policy_stats('test-policy-job')
        
        # Weight should decrease
        assert stats2['weight'] < stats1['weight']


class TestCompletePipeline:
    """Test the complete feedback pipeline."""
    
    @pytest.fixture(autouse=True)
    def setup_complete_test(self):
        """Setup test data."""
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        
        cur.execute("""
            INSERT OR IGNORE INTO jobs (id, title, team, location, type, created_at)
            VALUES ('pipeline-test-job', 'Pipeline Test', 'Test', 'Remote', 'Full-time', strftime('%s','now'))
        """)
        
        cur.execute("""
            INSERT OR IGNORE INTO candidates (
                id, job_id, name, x, stage, created_at, updated_at
            )
            VALUES (
                'pipeline-test-candidate', 
                'pipeline-test-job', 
                'Pipeline Test',
                '@pipelinetest',
                'discovery',
                strftime('%s','now'),
                strftime('%s','now')
            )
        """)
        
        conn.commit()
        conn.close()
        
        yield
        
        # Cleanup
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute("DELETE FROM reward_log WHERE job_id = 'pipeline-test-job'")
        cur.execute("DELETE FROM policy_state WHERE job_id = 'pipeline-test-job'")
        cur.execute("DELETE FROM candidates WHERE id = 'pipeline-test-candidate'")
        cur.execute("DELETE FROM jobs WHERE id = 'pipeline-test-job'")
        conn.commit()
        conn.close()
    
    def test_process_feedback_complete(self):
        """Test the complete process_feedback pipeline."""
        result = process_feedback(
            candidate_id='pipeline-test-candidate',
            job_id='pipeline-test-job',
            ai_score=85,
            recruiter_stars=3  # 50/100
        )
        
        # Check return values
        assert result['candidate_id'] == 'pipeline-test-candidate'
        assert result['job_id'] == 'pipeline-test-job'
        assert result['ai_score'] == 85
        assert result['recruiter_score'] == 50
        assert result['delta'] == -35  # 50 - 85
        assert result['reward_id'] > 0
        
        # Verify database updates
        # 1. Check candidates table
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute("SELECT score FROM candidates WHERE id = ?", ('pipeline-test-candidate',))
        score = cur.fetchone()[0]
        assert score == 85
        
        # 2. Check reward_log
        cur.execute("SELECT COUNT(*) FROM reward_log WHERE job_id = ?", ('pipeline-test-job',))
        count = cur.fetchone()[0]
        assert count == 1
        
        # 3. Check policy_state
        stats = get_policy_stats('pipeline-test-job')
        assert stats['sample_count'] == 1
        
        conn.close()


class TestAnalytics:
    """Test analytics and metrics functions."""
    
    @pytest.fixture(autouse=True)
    def setup_analytics_data(self):
        """Setup test data with multiple feedback samples."""
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        
        cur.execute("""
            INSERT OR IGNORE INTO jobs (id, title, team, location, type, created_at)
            VALUES ('analytics-test-job', 'Analytics Test', 'Test', 'Remote', 'Full-time', strftime('%s','now'))
        """)
        
        # Create multiple candidates
        for i in range(3):
            cur.execute("""
                INSERT OR IGNORE INTO candidates (
                    id, job_id, name, x, stage, created_at, updated_at
                )
                VALUES (
                    ?, 
                    'analytics-test-job', 
                    ?,
                    ?,
                    'discovery',
                    strftime('%s','now'),
                    strftime('%s','now')
                )
            """, (f'analytics-candidate-{i}', f'Test {i}', f'@test{i}'))
        
        # Add sample feedback data
        sample_data = [
            ('analytics-candidate-0', 80, 50, -30),  # Overrated
            ('analytics-candidate-1', 60, 75, 15),   # Underrated
            ('analytics-candidate-2', 70, 75, 5),    # Well-calibrated
        ]
        
        for candidate_id, ai_score, recruiter_score, delta in sample_data:
            cur.execute("""
                INSERT INTO reward_log (
                    candidate_id, job_id, ai_score, recruiter_score, delta, created_at
                )
                VALUES (?, 'analytics-test-job', ?, ?, ?, strftime('%s','now'))
            """, (candidate_id, ai_score, recruiter_score, delta))
        
        conn.commit()
        conn.close()
        
        yield
        
        # Cleanup
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute("DELETE FROM reward_log WHERE job_id = 'analytics-test-job'")
        cur.execute("DELETE FROM candidates WHERE job_id = 'analytics-test-job'")
        cur.execute("DELETE FROM jobs WHERE id = 'analytics-test-job'")
        conn.commit()
        conn.close()
    
    def test_compute_calibration_metrics(self):
        """Test calibration metrics computation."""
        metrics = compute_calibration_metrics('analytics-test-job')
        
        assert metrics['job_id'] == 'analytics-test-job'
        assert metrics['sample_count'] == 3
        
        # MAE = (30 + 15 + 5) / 3 = 16.67
        assert 16 <= metrics['mae'] <= 17
        
        # Bias = (-30 + 15 + 5) / 3 = -3.33
        assert -4 <= metrics['bias'] <= -3
        
        # RMSE should be higher than MAE (penalizes large errors)
        assert metrics['rmse'] > metrics['mae']
    
    def test_get_reward_history(self):
        """Test retrieving reward history."""
        history = get_reward_history('analytics-test-job', limit=10)
        
        assert len(history) == 3
        assert all('delta' in entry for entry in history)
        assert all('ai_score' in entry for entry in history)
        assert all('recruiter_score' in entry for entry in history)
    
    def test_calibration_metrics_empty_job(self):
        """Test metrics for job with no feedback."""
        metrics = compute_calibration_metrics('nonexistent-job')
        
        assert metrics['sample_count'] == 0
        assert metrics['mae'] is None
        assert metrics['bias'] is None
        assert metrics['rmse'] is None


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
