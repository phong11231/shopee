from flask import Flask, request, jsonify
import requests, re

app = Flask(__name__)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-platform': '"Windows"',
}


def resolve_link(url):
    shop_id = item_id = None
    resolved = url
    slug_name = ''
    try:
        if 's.shopee' in url or 'shope.ee' in url:
            r = requests.head(url, headers=HEADERS, allow_redirects=True, timeout=10)
            resolved = r.url
        m = re.search(r'i\.(\d+)\.(\d+)', resolved)
        if not m:
            m = re.search(r'product/(\d+)/(\d+)', resolved)
        if not m:
            m = re.search(r'-i\.(\d+)\.(\d+)', resolved)
        if m:
            shop_id, item_id = m.group(1), m.group(2)
        slug = re.search(r'shopee\.vn/([^?/]+)', resolved)
        if slug:
            slug_name = slug.group(1).replace('-', ' ')
    except:
        pass
    return shop_id, item_id, resolved, slug_name


def get_product(shop_id, item_id):
    for ver in ['v4', 'v2']:
        try:
            api = f'https://shopee.vn/api/{ver}/item/get?shopid={shop_id}&itemid={item_id}'
            r = requests.get(api, headers=HEADERS, timeout=10)
            d = r.json()
            item = d.get('data') or d.get('item')
            if item and item.get('name'):
                imgs = [f"https://down-vn.img.susercontent.com/file/{h}" for h in (item.get('images') or [])]
                price_raw = item.get('price', 0)
                if price_raw > 100000000:
                    price_raw = price_raw // 100000
                return {
                    'success': True, 'name': item['name'],
                    'price': price_raw,
                    'priceDisplay': f"{price_raw:,.0f}d",
                    'image': imgs[0] if imgs else '',
                    'images': imgs,
                    'sold': item.get('historical_sold') or item.get('sold', 0),
                    'shop': item.get('shop_location', ''),
                    'shopId': shop_id,
                    'rating': round(item.get('item_rating', {}).get('rating_star', 0), 1),
                    'description': (item.get('description') or '')[:500],
                    'video': item.get('video_info_list', []),
                }
        except:
            continue
    try:
        r = requests.get(f'https://shopee.vn/product/{shop_id}/{item_id}', headers=HEADERS, timeout=10)
        og_title = re.search(r'og:title.*?content="([^"]+)"', r.text)
        og_img = re.search(r'og:image.*?content="([^"]+)"', r.text)
        if og_title:
            return {
                'success': True, 'name': og_title.group(1),
                'image': og_img.group(1) if og_img else '',
                'images': [og_img.group(1)] if og_img else [],
                'price': 0, 'sold': 0, 'shop': '', 'shopId': shop_id,
            }
    except:
        pass
    return {'success': False, 'error': 'Khong the lay du lieu'}


@app.route('/api/shopee', methods=['GET', 'OPTIONS'])
def api_shopee():
    if request.method == 'OPTIONS':
        resp = jsonify({})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        return resp
    url = request.args.get('url', '')
    if not url:
        resp = jsonify({'error': 'Missing url param'})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp, 400
    shop_id, item_id, resolved, slug = resolve_link(url)
    if shop_id and item_id:
        result = get_product(shop_id, item_id)
        result['resolvedUrl'] = resolved
        result['slugName'] = slug
    else:
        result = {'success': False, 'error': 'Khong the lay shopid/itemid tu URL'}
    resp = jsonify(result)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


@app.route('/')
def home():
    return 'Shopee Proxy OK'


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
