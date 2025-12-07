import json
import requests
import time
import re
import sys

def parse_slack_url(url):
    """
    Parse Slack URL to extract workspace_id and channel_id.
    Expected format: https://app.slack.com/client/T09Q4L9DPK9/C09QZ1G7Y2V
    """
    pattern = r'https://app\.slack\.com/client/([A-Z0-9]+)(?:/([A-Z0-9]+))?'
    match = re.match(pattern, url)
    
    if not match:
        raise ValueError(f"Invalid Slack URL format: {url}")
    
    workspace_id = match.group(1)
    channel_id = match.group(2) if match.group(2) else None
    
    return workspace_id, channel_id

def fetch_and_extract_users(slack_url, output_file):
    workspace_id, channel_id = parse_slack_url(slack_url)
    print(f"Workspace ID: {workspace_id}")
    print(f"Channel ID: {channel_id if channel_id else 'None (will fetch all users)'}")
    
    url = f'https://edgeapi.slack.com/cache/{workspace_id}/users/list?_x_app_name=client&fp=2c&_x_num_retries=0'

    headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'text/plain;charset=UTF-8',
        'origin': 'https://app.slack.com',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    }

    # Cookie string from the provided CURL command
    cookie_str = "d-s=1763080631; b=.671c46480eada5b1cff3c4cff7688357; shown_ssb_redirect_page=1; ssb_instance_id=7a75076f-34b2-45aa-90d8-f682ee6863e7; _cs_c=0; _gcl_au=1.1.541544333.1764558885; _ga=GA1.1.1312325903.1764558886; OptanonAlertBoxClosed=2025-12-01T03:15:01.333Z; _fbp=fb.1.1764558944842.816446247593293487; shown_download_ssb_modal=1; show_download_ssb_banner=1; no_download_ssb_banner=1; utm=%7B%22utm_source%22%3A%22in-prod%22%2C%22utm_medium%22%3A%22inprod-apps_link-slack_menu-click%22%7D; _ga_QR4NFYRYGP=GS2.1.s1765047883$o2$g0$t1765047883$j60$l0$h0; optimizelySession=0; x=671c46480eada5b1cff3c4cff7688357.1765049468; tz=-480; ec=enQtMTAwNjYzMjQxMzU2ODYtNzMzYjBlZTI4NDBkZjgxNzY2NGEzYjRkYmFlOTdiNzcyMGJiYmUxMDY4YzkyZWFiMGNkZWI2ZjVmYjk1ZDkzYQ; PageCount=16; _cs_cvars=%7B%225%22%3A%5B%22curr_plan%22%2C%22free%22%5D%2C%226%22%3A%5B%22is_paid_plan%22%2C%22false%22%5D%7D; _cs_id=7ad18323-ebba-a177-a1de-5d2deb5a8eda.1764558884.9.1765050256.1765049469.1.1798722884384.1.x; _ga_QTJQME5M5D=GS2.1.s1765047883$o7$g1$t1765050256$j27$l0$h0; lc=1765050259; OptanonConsent=isGpcEnabled=0&datestamp=Sat+Dec+06+2025+11%3A44%3A20+GMT-0800+(Pacific+Standard+Time)&version=202402.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=4cdbbe69-edb8-4a8a-96cf-63ef14c1d7ec&interactionCount=2&isAnonUser=1&landingPath=NotLandingPage&groups=1%3A1%2C2%3A1%2C3%3A1%2C4%3A1&AwaitingReconsent=false&geolocation=CA%3BON; d=xoxd-DOr4yz4qkyMfsnCn8FYWajaI7wYwdhjrQ1Uy7Zf44Cs%2BN0CJF4VgjsMrOoiYNdY0Nc4GFaiVECu8xxVdnPAvEX1JPluOL3uAlluj2sL%2FarNAkovj7l2v1CEUJ63AACtIVSH%2FKWMNF%2FXro%2FbzYSX1o70fhxNSDZwGdpa7NBr7j2JZqw00hDbSM4xeWEAeVIqVLPQ5cU2FPvEd%2FHXSL1PMaK3e%2FJ0%3D; _cs_s=3.5.U.9.1765052087018; web_cache_last_updated1f93fa4b5896c543f8fd5d49829c8f6d=1765050293557; web_cache_last_updatede03f75ff848f42271fddacbdb5477404=1765050433210"
    
    # Parse cookies into a dictionary
    cookies = {}
    for c in cookie_str.split(';'):
        if '=' in c:
            k, v = c.split('=', 1)
            cookies[k.strip()] = v.strip()

    # Base payload. 
    # NOTE: The 'marker' field is intentionally omitted to start scraping from the beginning (get all users).
    # If a specific start point is needed, add "marker": "..." here.
    payload = {
        "token": "xoxc-9980011601159-10026491834404-10036218003985-f3a5a5ec7f1fff05794ae133e6223cfa4afd0125c7a0285801c664b091207b12",
        "include_profile_only_users": True,
        "count": 1000,  # Increased from 50 to 1000 for faster fetching
        "filter": "people",
        "index": "users_by_display_name",
        "locale": "en-US",
        "present_first": False,
        "fuzz": 1
    }
    
    # Add channel filter only if channel_id is provided in the URL
    if channel_id:
        payload["channels"] = [channel_id]

    extracted_users = []
    page_count = 0
    
    print("Starting user scrape from Slack Edge API...")

    while True:
        try:
            # Using json.dumps(payload) for data param to ensure we send raw string with the text/plain content-type header
            response = requests.post(url, headers=headers, cookies=cookies, data=json.dumps(payload))
            response.raise_for_status()
            
            data = response.json()
            
            if not data.get("ok"):
                print(f"API Error: {data.get('error')}")
                break

            results = data.get("results", [])
            print(f"Page {page_count + 1}: Fetched {len(results)} users")
            
            for user in results:
                profile = user.get('profile', {})
                user_info = {
                    "id": user.get('id'),
                    "team_id": user.get('team_id'),
                    "name": user.get('name'),
                    "real_name": user.get('real_name'),
                    "image_original": profile.get('image_original'),
                    "email": profile.get('email'),
                    "tz": user.get('tz')
                }
                extracted_users.append(user_info)
            
            page_count += 1
            next_marker = data.get("next_marker")
            
            if next_marker:
                payload["marker"] = next_marker
                # Reduced delay for faster fetching (0.1s instead of 1s)
                time.sleep(0.1)
            else:
                print("No more pages.")
                break
                
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            break
        except json.JSONDecodeError:
            print("Failed to decode JSON response")
            print(f"Response preview: {response.text[:200]}")
            break

    print(f"Total extracted users: {len(extracted_users)}")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(extracted_users, f, indent=4, ensure_ascii=False)
    
    print(f"Successfully saved data to {output_file}")

# MANUAL HARDCODED SLACK URL TEST STUB
if __name__ == "__main__":
    # Hardcoded test Slack URL (replace with your own to test)
    slack_url = "https://app.slack.com/client/T09UU0BHP4P/C09UU0BUQKZ"
    output_file = "extracted_users.json"

    print(f"Testing with hardcoded Slack URL: {slack_url}")
    print(f"Would write data to: {output_file}")

    # You would call your main extraction logic here, e.g.:
    fetch_and_extract_users(slack_url, output_file)
