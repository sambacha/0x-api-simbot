import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import decimal
from decimal import Decimal
from ab_utils import load_ab_data
from utils import is_successful_swap, get_max_value, format_value

decimal.setcontext(decimal.Context(prec=64))
sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    args.add_argument('--buys', action='store_true', default=False)
    args.add_argument('--sells', action='store_true', default=False)
    args.add_argument('--tokens', '-t', type=str, default='')
    return args.parse_args()

def get_realized_price(swap):
    result = swap['metadata']['swapResult']
    bought = Decimal(result['boughtAmount'])
    sold = Decimal(result['soldAmount'])
    return float(bought / sold)

def are_valid_swaps(args, swaps):
    if not all(is_successful_swap(s) for s in swaps):
        return False
    if args.buys and any(s['metadata']['side'] != 'buy' for s in swaps):
        return False
    if args.sells and any(s['metadata']['side'] != 'sell' for s in swaps):
        return False
    tokens = args.tokens.split(',') if len(args.tokens) else []
    if len(tokens) > 0 and any(\
        s['metadata']['makerToken'] not in tokens or \
        s['metadata']['takerToken'] not in tokens \
        for s in swaps):
        return False
    return True

args = get_program_args()
data = [d for d in load_ab_data(args.path) if are_valid_swaps(args, d.values())]
print(f'Loaded {len(data)} data items')

count_by_value_by_url = {}
for d in data:
    best_swap_url = max(d.keys(), key=lambda k: get_realized_price(d[k]))
    worst_swap_url = min(d.keys(), key=lambda k: get_realized_price(d[k]))
    if best_swap_url == worst_swap_url:
        continue
    best_swap = d[best_swap_url]
    worst_swap = d[worst_swap_url]
    best_price = get_realized_price(best_swap)
    worst_price = get_realized_price(worst_swap)
    bps = (best_price - worst_price) / worst_price * 1e4
    value = get_max_value(d[best_swap_url])

    count_by_value_by_url[value] = count_by_value_by_url.get(value, {})
    count_by_value_by_url[value][best_swap_url] = count_by_value_by_url[value].get(best_swap_url, 0)
    count_by_value_by_url[value][worst_swap_url] = count_by_value_by_url[value].get(worst_swap_url, 0)
    count_by_value_by_url[value][best_swap_url] += 1

print(count_by_value_by_url)
