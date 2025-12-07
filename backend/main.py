from flask import Flask, render_template, request, jsonify, session, redirect, url_for, make_response
import json
import os
from dotenv import load_dotenv
from xdk import Client
from xdk.oauth2_auth import OAuth2PKCEAuth
from xai_sdk import Client as XAIClient
from x_scraper import XScraper
from x_analyzer import analyze_profile_for_job
from x_head_hunter import XHeadHunter

load_dotenv()

app = Flask(__name__, template_folder='../templates')
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')

# Session configuration for OAuth callbacks (cross-site redirects)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS

# OAuth2 PKCE configuration
OAUTH_REDIRECT_URI = "http://localhost:8080/callback"
OAUTH_SCOPE = "tweet.read users.read offline.access"

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
        
        # Create response and store entire token dict in cookie for persistence
        response = make_response(redirect(url_for('index')))
        # Store token as JSON, httponly for security, max_age = 7 days
        response.set_cookie('x_token', json.dumps(tokens), httponly=True, max_age=7*24*60*60)
        
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
        candidates = head_hunter.hunt()
        
        return jsonify({
            "success": True,
            "job_description": job_desc,
            "candidates_count": len(candidates),
            "candidates": candidates
        })
    except Exception as e:
        print(f"Error during hunt: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
