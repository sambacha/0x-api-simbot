import json

def get_swap_url(swap):
    return swap['metadata'].get('api', None) or swap['metadata'].get('apiURL')

def load_ab_data(path):
    swaps = []
    with open(path) as f:
        for line in f.readlines():
            try:
                swaps.append(json.loads(line))
            except:
                pass
    rewrite_urls(swaps)
    swaps_by_id_by_url = {}
    for swap in swaps:
        id = swap['metadata']['id']
        url = get_swap_url(swap)
        swaps_by_id_by_url[id] = swaps_by_id_by_url.get(id, {})
        swaps_by_id_by_url[id][url] = swap
    return list(swaps_by_id_by_url.values())

def rewrite_urls(swaps):
    urls = set()
    for swap in swaps:
        urls.add(get_swap_url(swap))
    prefix = find_common_prefix(list(urls))
    if len(prefix):
        for swap in swaps:
            swap['metadata']['apiId'] = get_swap_url(swap)[len(prefix):]
    return swaps

def find_common_prefix(urls):
    shortest_url = min(urls, key=lambda u: len(u))
    parts = shortest_url.split('/')
    for i in reversed(range(len(parts))):
        prefix = '/'.join(parts[:i])
        if all(u.startswith(prefix) for u in urls):
            return prefix
    return ''
