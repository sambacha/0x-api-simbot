import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import decimal
from decimal import Decimal
from ab_utils import load_ab_data
from utils import is_successful_swap

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

BPS_STOPS = [1, 5, 10, 50, 100, 1000]

count_by_stop_by_url = {}
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
    stop = None
    for s in BPS_STOPS:
        if bps < s:
            break
        stop = s
    if stop is None:
        continue
    count_by_stop_by_url[stop] = count_by_stop_by_url.get(stop, {})
    count_by_stop_by_url[stop][best_swap_url] = count_by_stop_by_url[stop].get(best_swap_url, 0)
    count_by_stop_by_url[stop][worst_swap_url] = count_by_stop_by_url[stop].get(worst_swap_url, 0)
    count_by_stop_by_url[stop][best_swap_url] += 1

stops = sorted(list(count_by_stop_by_url.keys()))
totals_by_stop = { stop: sum(count_by_stop_by_url[stop].values()) for stop in stops }
max_total = max(totals_by_stop.values())
urls = sorted(list(list(count_by_stop_by_url.values())[0].keys()))
prev_ys = [0 for d in stops]
xs = list(range(len(stops)))
for url in urls:
    ys = [count_by_stop_by_url[stop].get(url, 0) / totals_by_stop[stop] for stop in stops]
    widths = [max(totals_by_stop[stop] / max_total, 0.025) for stop in stops]
    plt.bar(xs, ys, bottom=prev_ys, label=url, width=widths)
    prev_ys = [py + y for py, y in zip(prev_ys, ys)]

plt.legend()
plt.xticks(xs, [f'{stop}bps+ ({totals_by_stop[stop]})' for stop in stops])
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: '%d%%' % (y * 100)))
plt.xlabel('winner\'s edge')
plt.ylabel('win rate')
swap_type = 'buys' if args.buys else 'sells' if args.sells else 'swaps'
plt.title(f'A-B realized fill win rate by edge ({sum(totals_by_stop.values())}/{len(data)} unequal {swap_type})')
plt.show()
