from flask import Flask, render_template, request, jsonify, session, redirect, url_for, make_response, Response
from flask_cors import CORS
import json
import os
from dotenv import load_dotenv
from xdk import Client
from xdk.oauth2_auth import OAuth2PKCEAuth
from xai_sdk import Client as XAIClient
from x_scraper import XScraper
from x_analyzer import analyze_profile_for_job
from x_head_hunter import XHeadHunter
from concurrent.futures import ThreadPoolExecutor, as_completed
from RLloop.grokScore import rank_candidate, CandidateScore
from x_dm import XDirectMessaging

load_dotenv()

app = Flask(__name__, template_folder='../templates')
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')

# Enable CORS for frontend
CORS(app, supports_credentials=True, origins=["http://localhost:3000"])

# Session configuration for OAuth callbacks (cross-site redirects)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS

# OAuth2 PKCE configuration
OAUTH_REDIRECT_URI = "http://localhost:8080/callback"
OAUTH_SCOPE = "tweet.read users.read dm.read dm.write offline.access"

# In-memory storage for PKCE verifiers (keyed by state)
# This avoids session cookie issues with OAuth cross-site redirects
pkce_store = {}

# In-memory storage for access tokens (simple single-user dev setup)
token_store = None

# Load users from JSON
def load_users():
    with open('./extracted_users.json', 'r') as f:
        return json.load(f)

def get_xai_authenticated_client():
    return XAIClient(api_key=os.getenv('XAI_API_KEY'))

def get_x_authenticated_client():
    """Get an authenticated X client using stored tokens.
    
    Tries cookies first, then falls back to in-memory token_store.
    Returns None if no valid token is found.
    """
    global token_store
    
    # Try to get token from cookie first
    token_cookie = request.cookies.get('x_token')

    print(f"Token cookie: {token_cookie}")

    if token_cookie:
        try:
            token = json.loads(token_cookie)
            return Client(token=token)
        except json.JSONDecodeError:
            pass
    
    # Fall back to in-memory token_store
    if token_store:
        return Client(token=token_store)
    
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/auth/status')
def auth_status():
    """Check if user is authenticated with X."""
    client = get_x_authenticated_client()
    if client:
        try:
            # Try to get the authenticated user's info
            me = client.users.get_me(user_fields=["name", "username", "profile_image_url"])
            if me and me.data:
                return jsonify({
                    "authenticated": True,
                    "user": {
                        "name": me.data.get("name"),
                        "username": me.data.get("username"),
                        "profile_image_url": me.data.get("profile_image_url")
                    }
                })
        except Exception as e:
            print(f"Error getting user info: {e}")
    
    return jsonify({"authenticated": False})

@app.route('/auth/logout', methods=['POST'])
def logout():
    """Clear authentication."""
    global token_store
    token_store = None
    response = make_response(jsonify({"success": True}))
    response.delete_cookie('x_token')
    return response


@app.route('/echo')
def echo():
    return jsonify({"token": request.cookies.get('x_token')})


# OAuth2 PKCE for user context authorization
@app.route('/authorize')
def authorize():
    """Start OAuth2 PKCE flow for user auth."""
    client_id = os.getenv('X_CLIENT_ID')
    if not client_id:
        return "X_CLIENT_ID not set", 500

    # Step 1: Create PKCE instance
    auth = OAuth2PKCEAuth(
        client_id=client_id,
        redirect_uri=OAUTH_REDIRECT_URI,
        scope=OAUTH_SCOPE
    )
    
    # Step 2: Get authorization URL
    auth_url = auth.get_authorization_url()
    
    # Store PKCE verifier in memory, keyed by state
    # State is passed through OAuth flow and returned in callback
    state = auth.oauth2_session._state
    pkce_store[state] = auth.code_verifier
    
    print(f"Authorize - Storing state: {state}")
    print(f"Authorize - Storing verifier: {auth.code_verifier[:20]}...")
    
    return redirect(auth_url)

@app.route('/callback')
def callback():
    """Handle OAuth callback, exchange code for tokens."""
    state = request.args.get('state')
    code = request.args.get('code')
    
    if not code or not state:
        return "Authorization failed: missing code or state", 400
    
    # Look up verifier from in-memory store using state
    verifier = pkce_store.get(state)
    
    print(f"Callback - URL state: {state}")
    print(f"Callback - Found verifier: {verifier is not None}")
    
    if not verifier:
        return f"Authorization failed: unknown state. Please try authorizing again.", 400
    
    client_id = os.getenv('X_CLIENT_ID')
    
    # Recreate auth with stored verifier
    auth = OAuth2PKCEAuth(
        client_id=client_id,
        redirect_uri=OAUTH_REDIRECT_URI,
        scope=OAUTH_SCOPE
    )
    auth.code_verifier = verifier
    
    try:
        # Exchange code for tokens
        tokens = auth.fetch_token(authorization_response=request.url)
        
        # Store tokens in memory
        global token_store
        token_store = tokens

        # Clean up PKCE store
        pkce_store.pop(state, None)
        
        print("Callback - Token exchange successful!")
        print(f"Callback - Access token stored: {tokens['access_token'][:20]}...")
        
        # Create response and redirect to frontend
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        response = make_response(redirect(frontend_url))
        # Store token as JSON, httponly for security, max_age = 7 days
        # Set SameSite=None for cross-site cookie (backend to frontend)
        response.set_cookie('x_token', json.dumps(tokens), httponly=True, max_age=7*24*60*60, samesite='Lax')
        
        return response
    except Exception as e:
        print(f"Token exchange error: {e}")
        return f"Token exchange failed: {e}", 500

# @app.route('/analyze', methods=['POST'])
# def analyze_candidates():
#     job_desc = request.form.get('job_desc')
#     if not job_desc:
#         return "Job description is required.", 400
#
#     client = get_x_authenticated_client()
#     if not client:
#         # Not authenticated - redirect to authorize
#         return redirect(url_for('authorize'))
# 
#     users = load_users()
#     x_scraper = XScraper(client)
#     results = []
#     for user in users:
#         name = user['real_name']
#         print(f"Processing user: {name}")
#         try:
#             profile = x_scraper.scrape_user_data(name)
#
#             if profile:
#                 analysis = analyze_profile_for_job(profile, job_desc)
#                 # Extract score from analysis (default to 0 if not found)
#                 score = analysis.get('score', 0) if isinstance(analysis, dict) else 0
#                 results.append({
#                     'name': name,
#                     'email': user.get('email', 'N/A'),
#                     'profile_link': profile.get('user', {}).get('profile_link', 'N/A'),
#                     'analysis': analysis,
#                     'score': score
#                 })
#             else:
#                 print(f"No profile found for {name}")
#         except Exception as e:
#             print(f"Error processing {name}: {e}")
#             results.append({
#                 'name': name,
#                 'email': user.get('email', 'N/A'),
#                 'profile_link': 'N/A',
#                 'analysis': f"Error processing: {str(e)}",
#                 'score': 0
#             })
#
#     return render_template('results.html', results=results, job_desc=job_desc)

@app.route('/hunt', methods=['POST'])
def hunt_candidates():
    """Hunt for candidates on X based on job description using XHeadHunter."""
    if request.is_json:
        job_desc = request.json.get('job_desc')
    else:
        job_desc = request.form.get('job_desc')
    
    if not job_desc:
        return jsonify({"error": "Job description is required."}), 400

    xai_client = get_xai_authenticated_client()
    if not xai_client:
        return jsonify({"error": "Not authenticated. Please authorize first at /authorize"}), 401
 
    x_client = get_x_authenticated_client()
    if not x_client:
        return jsonify({"error": "Not authenticated. Please authorize first at /authorize"}), 401
    
    try:
        # Initialize head hunter with job description and clients
        head_hunter = XHeadHunter(
            job_description=job_desc,
            x_client=x_client,
            xai_client=xai_client
        )
        
        # Hunt for candidates
        result = head_hunter.hunt()
        
        return jsonify({
            "success": True,
            "job_description": job_desc,
            "total_searched": result["total_searched"],
            "candidates_count": result["total_viable"],
            "candidates": result["viable_candidates"]
        })
    except Exception as e:
        print(f"Error during hunt: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/hunt/stream', methods=['POST'])
def hunt_candidates_stream():
    """Stream hunt progress for candidates on X based on job description."""
    if request.is_json:
        job_desc = request.json.get('job_desc')
    else:
        job_desc = request.form.get('job_desc')
    
    if not job_desc:
        return jsonify({"error": "Job description is required."}), 400

    xai_client = get_xai_authenticated_client()
    if not xai_client:
        return jsonify({"error": "XAI not authenticated."}), 401
 
    x_client = get_x_authenticated_client()
    if not x_client:
        return jsonify({"error": "X not authenticated. Please authorize first at /authorize"}), 401
    
    def generate():
        def send(data):
            return f"data: {json.dumps(data)}\n\n"
        
        try:
            yield send({"type": "start", "message": "Starting candidate hunt..."})
            
            # Initialize head hunter
            head_hunter = XHeadHunter(
                job_description=job_desc,
                x_client=x_client,
                xai_client=xai_client
            )
            
            # Step 1: Generate keywords
            yield send({"type": "progress", "message": "Generating search keywords with Grok..."})
            keywords = head_hunter._generate_keywords()
            
            if not keywords:
                yield send({"type": "error", "message": "Failed to generate keywords"})
                return
            
            yield send({"type": "keywords", "keywords": keywords, "message": f"Generated {len(keywords)} keywords: {', '.join(keywords)}"})
            
            # Step 2: Search for users
            yield send({"type": "progress", "message": f"Searching X for users across {len(keywords)} keywords..."})
            
            users_map = {}
            with ThreadPoolExecutor(max_workers=8) as executor:
                future_to_keyword = {
                    executor.submit(head_hunter._search_users_by_keyword, keyword): keyword
                    for keyword in keywords
                }
                
                for future in as_completed(future_to_keyword):
                    keyword = future_to_keyword[future]
                    try:
                        users = future.result()
                        new_users = 0
                        for user_data in users:
                            username = user_data.get('username')
                            if username and username not in users_map:
                                users_map[username] = {
                                    'user': user_data,
                                    'found_via_keyword': keyword,
                                    'tweets': []
                                }
                                new_users += 1
                        if new_users > 0:
                            yield send({"type": "search_progress", "keyword": keyword, "found": new_users, "total": len(users_map), "message": f"Found {new_users} new users via '{keyword}' ({len(users_map)} total)"})
                    except Exception as e:
                        print(f"Error searching keyword '{keyword}': {e}")
            
            yield send({"type": "progress", "message": f"Found {len(users_map)} unique users. Fetching tweets..."})
            
            # Step 3: Fetch tweets
            with ThreadPoolExecutor(max_workers=4) as executor:
                future_to_username = {
                    executor.submit(head_hunter._fetch_user_tweets, users_map[username]['user'].get('id')): username
                    for username in users_map
                    if users_map[username]['user'].get('id')
                }
                
                tweets_fetched = 0
                for future in as_completed(future_to_username):
                    username = future_to_username[future]
                    try:
                        tweets = future.result()
                        users_map[username]['tweets'] = tweets
                        tweets_fetched += 1
                        if tweets_fetched % 10 == 0:
                            yield send({"type": "tweets_progress", "fetched": tweets_fetched, "total": len(users_map), "message": f"Fetched tweets for {tweets_fetched}/{len(users_map)} users"})
                    except Exception as e:
                        print(f"Error fetching tweets for @{username}: {e}")
            
            yield send({"type": "progress", "message": f"Evaluating {len(users_map)} candidates with Grok..."})
            
            # Step 4: Evaluate candidates
            viable_candidates = {}
            evaluated = 0
            
            with ThreadPoolExecutor(max_workers=20) as executor:
                future_to_username = {
                    executor.submit(head_hunter._evaluate_candidate, username, users_map[username], users_map[username]['tweets']): username
                    for username in users_map
                }
                
                for future in as_completed(future_to_username):
                    username = future_to_username[future]
                    try:
                        evaluation = future.result()
                        users_map[username]['evaluation'] = evaluation
                        evaluated += 1
                        
                        if evaluation.get('is_viable') and evaluation.get('account_type') == 'individual':
                            viable_candidates[username] = users_map[username]
                            yield send({
                                "type": "candidate",
                                "username": username,
                                "candidate": users_map[username],
                                "message": f"✓ @{username} is viable",
                                "evaluated": evaluated,
                                "total": len(users_map),
                                "viable_count": len(viable_candidates)
                            })
                        else:
                            if evaluated % 5 == 0:
                                yield send({
                                    "type": "eval_progress",
                                    "evaluated": evaluated,
                                    "total": len(users_map),
                                    "viable_count": len(viable_candidates),
                                    "message": f"Evaluated {evaluated}/{len(users_map)} ({len(viable_candidates)} viable)"
                                })
                    except Exception as e:
                        print(f"Error evaluating @{username}: {e}")
            
            yield send({
                "type": "complete",
                "total_searched": len(users_map),
                "total_viable": len(viable_candidates),
                "candidates": viable_candidates,
                "message": f"Hunt complete! Found {len(viable_candidates)} viable candidates out of {len(users_map)} searched"
            })
            
        except Exception as e:
            print(f"Hunt stream error: {e}")
            yield send({"type": "error", "message": str(e)})
    
    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Credentials': 'true'
    })

@app.route('/rank', methods=['POST'])
def rank_candidate_endpoint():
    """Rank a candidate against job requirements using Grok with RL self-improvement."""
    if request.is_json:
        data = request.json
    else:
        return jsonify({"error": "JSON body required"}), 400
    
    candidate_description = data.get('candidate_description')
    job_requirements = data.get('job_requirements')
    job_id = data.get('job_id')  # Optional: enables RL calibration
    
    if not candidate_description or not job_requirements:
        return jsonify({"error": "candidate_description and job_requirements are required"}), 400
    
    try:
        # Pass job_id for self-improving scoring based on recruiter feedback
        result = rank_candidate(candidate_description, job_requirements, job_id=job_id)
        
        # Get calibration info to return alongside score
        calibration_applied = False
        calibration_info = None
        if job_id:
            try:
                calibration_info = compute_calibration_metrics(job_id)
                if calibration_info and calibration_info.get('sample_count', 0) >= 2:
                    calibration_applied = True
            except Exception:
                pass
        
        return jsonify({
            "success": True,
            "score": result.score,
            "calibration_applied": calibration_applied,
            "calibration_info": calibration_info
        })
    except Exception as e:
        print(f"Ranking error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/send-dm', methods=['POST'])
def send_direct_message():
    """Generate and optionally send a personalized DM to a candidate."""
    if request.is_json:
        data = request.json
    else:
        return jsonify({"error": "JSON body required"}), 400
    
    # Required fields
    candidate_data = data.get('candidate_data')
    job_description = data.get('job_description')
    company_name = data.get('company_name')
    recruiter_name = data.get('recruiter_name')
    test_link = data.get('test_link')
    
    if not candidate_data:
        return jsonify({"error": "candidate_data is required"}), 400
    if not job_description:
        return jsonify({"error": "job_description is required"}), 400
    if not company_name:
        return jsonify({"error": "company_name is required"}), 400
    if not recruiter_name:
        return jsonify({"error": "recruiter_name is required"}), 400
    
    try:
        x_client = get_x_authenticated_client()
        xai_client = get_xai_authenticated_client()
        dm_handler = XDirectMessaging(xai_client=xai_client, x_client=x_client)
        
        result = dm_handler.generate_and_send(
            candidate_data=candidate_data,
            job_description=job_description,
            company_name=company_name,
            recruiter_name=recruiter_name,
            test_link=test_link
        )
        
        return jsonify(result)
    except Exception as e:
        print(f"Error with DM: {e}")
        return jsonify({"error": str(e)}), 500

# ==================== RL FEEDBACK ENDPOINT ====================
from RLloop.rl_feedback import process_feedback, get_policy_stats, compute_calibration_metrics

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    """
    Submit recruiter feedback for RL learning.
    
    Expected JSON body:
    {
        "candidate_id": "...",
        "job_id": "...",
        "ai_score": 75,
        "recruiter_stars": 4
    }
    """
    data = request.json
    
    candidate_id = data.get('candidate_id')
    job_id = data.get('job_id')
    ai_score = data.get('ai_score')
    recruiter_stars = data.get('recruiter_stars')
    
    if not all([candidate_id, job_id, ai_score is not None, recruiter_stars]):
        return jsonify({"error": "Missing required fields"}), 400
    
    if not 1 <= recruiter_stars <= 5:
        return jsonify({"error": "recruiter_stars must be 1-5"}), 400
    
    try:
        result = process_feedback(
            candidate_id=candidate_id,
            job_id=job_id,
            ai_score=int(ai_score),
            recruiter_stars=int(recruiter_stars)
        )
        
        # Also get updated policy stats
        policy_stats = get_policy_stats(job_id)
        
        return jsonify({
            "success": True,
            "feedback": result,
            "policy_stats": policy_stats
        })
    except Exception as e:
        print(f"Error processing feedback: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/policy/<job_id>', methods=['GET'])
def get_policy(job_id):
    """Get RL policy stats and calibration metrics for a job."""
    try:
        stats = get_policy_stats(job_id)
        metrics = compute_calibration_metrics(job_id)
        
        return jsonify({
            "policy_stats": stats,
            "calibration_metrics": metrics
        })
    except Exception as e:
        print(f"Error getting policy: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
