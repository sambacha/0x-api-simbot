import json

DELAYS = [(0, 30), (30, 60), (60, 90), (90, 180), (180, 600)]
VALUES = [(0, 250), (250, 1000), (1000, 5000), (5000, 10000), (10000, 25000)]

def load_data(path, url=None):
    data = []
    with open(path) as f:
        for line in f.readlines():
            try:
                data.append(json.loads(line))
            except:
                pass
    if url is None:
        return data
    return [d for d in data if url in d['metadata']['apiURL']]

def format_value(value):
    if value >= 1000:
        return f'${value // 1000}K'
    return f'${value}'

def get_max_value(swap):
    fill_value = float(swap['metadata']['fillValue'])
    for min_value, max_value in VALUES:
        if fill_value < max_value:
            return max_value
    return float('inf')

def get_min_delay(swap):
    delay = swap['metadata']['fillDelay']
    for min_delay, max_delay in DELAYS:
        if delay < max_delay:
            return min_delay
    return DELAYS[-1][1]

def is_successful_swap(swap):
    result = swap['metadata']['swapResult']
    return result['revertData'] == '0x' and result['boughtAmount'] != '0'
