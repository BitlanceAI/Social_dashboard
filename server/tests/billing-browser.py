import json, time, base64, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[2]
settings = (root / 'client/.env').read_text()
url = re.search(r'^VITE_SUPABASE_URL\s*=\s*["\']?([^\s"\']+)', settings, re.M).group(1)
project = url.split('//')[1].split('.')[0]
user = {'id': '00000000-0000-0000-0000-000000000001', 'email': 'billing-test@example.test', 'aud': 'authenticated', 'role': 'authenticated'}
encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token = encode({'alg': 'HS256'}) + '.' + encode({'sub': user['id'], 'exp': int(time.time()) + 3600}) + '.test'
session = {'access_token': token, 'refresh_token': 'test', 'expires_at': int(time.time()) + 3600, 'expires_in': 3600, 'token_type': 'bearer', 'user': user}
plan = {'key': 'solo', 'name': 'Solo', 'monthlyPrice': 30000, 'yearlyPrice': 300000, 'currency': 'INR', 'includedAccounts': 1, 'includedUsers': 1, 'includedWorkspaces': 1, 'generationLimit': 20, 'trialAutoPostLimit': 2, 'trialDays': 15, 'features': [], 'monthlyPurchasable': True, 'yearlyPurchasable': True}
me = {'planKey': 'solo', 'planName': 'Solo', 'interval': 'monthly', 'status': 'trialing', 'active': False, 'mandateRequired': True, 'paymentsEnabled': True, 'usage': {'accounts': 0, 'workspaces': 1, 'users': 1, 'generations': 0, 'trialAutoPosts': 0}, 'limits': {'accounts': 1, 'workspaces': 1, 'users': 1, 'generations': 20, 'trialAutoPosts': 2}}
requests = []
def route(request):
    address = request.request.url
    if '/api/billing/plans' in address:
        return request.fulfill(json={'plans': [plan], 'trialDays': 15, 'paymentsEnabled': True})
    if '/api/billing/me' in address:
        return request.fulfill(json=me)
    if '/api/billing/subscribe' in address:
        requests.append(request.request.post_data_json)
        return request.fulfill(status=503, json={'error': 'Test checkout intercepted'})
    if '/auth/v1/user' in address:
        return request.fulfill(json=user)
    if '127.0.0.1:5179' in address:
        return request.continue_()
    return request.fulfill(json=[])

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    context.route('**/*', route)
    context.add_init_script(f"localStorage.setItem('sb-{project}-auth-token', {json.dumps(json.dumps(session))});")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5179/billing')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='Finish setting up your trial')).to_be_visible()
    choose = page.get_by_role('button', name='Choose Solo')
    expect(choose).to_be_disabled()
    page.get_by_role('checkbox').check()
    expect(choose).to_be_enabled()
    choose.click()
    expect(page.get_by_text('Test checkout intercepted')).to_be_visible()
    assert requests == [{'planKey': 'solo', 'interval': 'monthly', 'recurringConsent': True}]
    page.get_by_role('button', name='Yearly · save').click()
    expect(page.get_by_role('checkbox')).not_to_be_checked()
    expect(choose).to_be_disabled()
    page.get_by_role('checkbox').check()
    choose.click()
    assert requests[-1]['interval'] == 'yearly'
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(root / '../reports/billing-mobile.png'), full_page=True)
    page.goto('http://127.0.0.1:5179/socialdashboad')
    page.wait_for_url('**/billing')
    assert not errors, errors
    browser.close()
print('Browser passed: trial setup, consent gating, monthly/yearly checkout payloads, mobile layout, and mandatory billing redirect.')
