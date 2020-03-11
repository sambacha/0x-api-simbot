import json

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
        url = swap['metadata']['apiURL']
        swaps_by_id_by_url[id] = swaps_by_id_by_url.get(id, {})
        swaps_by_id_by_url[id][url] = swap
    return list(swaps_by_id_by_url.values())

def rewrite_urls(swaps):
    urls = set()
    for swap in swaps:
        urls.add(swap['metadata']['apiURL'])
    prefix = find_common_prefix(list(urls))
    for swap in swaps:
        swap['metadata']['apiURL'] = swap['metadata']['apiURL'][len(prefix):]
    return swaps

def find_common_prefix(urls):
    shortest_url = urls[0]
    for url in urls[1:]:
        if len(shortest_url) > len(url):
            shortest_url = url
    for i in reversed(range(len(shortest_url))):
        prefix = shortest_url[:i]
        if all(u.startswith(prefix) for u in urls):
            return prefix
    return ''
