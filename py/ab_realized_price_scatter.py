import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
import decimal
from decimal import Decimal
from ab_utils import load_ab_data
from utils import is_successful_swap, format_value

decimal.setcontext(decimal.Context(prec=64))
sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    args.add_argument('--buys', action='store_true', default=False)
    args.add_argument('--sells', action='store_true', default=False)
    args.add_argument('--adjusted', action='store_true', default=False)
    args.add_argument('--tokens', '-t', type=str, default='')
    return args.parse_args()
args = get_program_args()

def get_realized_price(swap):
    result = swap['metadata']['swapResult']
    if args.adjusted:
        if swap['metadata']['side'] == 'sell':
            bought = Decimal(result['adjustedBoughtAmountUsd'])
            sold = Decimal(result['soldAmountUsd'])
        else:
            bought = Decimal(result['boughtAmountUsd'])
            sold = Decimal(result['adjustedSoldAmountUsd'])
    else:
        bought = Decimal(result['boughtAmount'])
        sold = Decimal(result['soldAmount'])
    return float(bought / sold)

def are_valid_swaps(swaps):
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

data = [d for d in load_ab_data(args.path) if are_valid_swaps(d.values())]
print(f'Loaded {len(data)} data items')

urls = set()
rows = []
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
    if bps < 1:
        continue
    rows.append([best_swap_url, bps, float(best_swap['metadata']['fillValue'])])
    urls.add(best_swap_url)

sns.scatterplot(
    x='fill size',
    y='bps',
    hue='api',
    data=pd.DataFrame(
        rows,
        columns=['api', 'bps', 'fill size'],
    ),
)

# plt.legend()
# plt.yticks(xs, [f'{stop}bps+ ({totals_by_stop[stop]})' for stop in stops])
# plt.xticks(list(range(len(VALUES))), [f'< {format_value(max_value)}' for min_value, max_value in VALUES])
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y)}'))
plt.gca().xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, pos: format_value(x)))
# plt.xlabel('winner\'s edge')
# plt.ylabel('win rate')
plt.yscale('log')
metric_type = 'adjusted realized' if args.adjusted else 'realized'
swap_type = 'buys' if args.buys else 'sells' if args.sells else 'swaps'
plt.title(f'A-B {metric_type} fill win rate ({len(rows)}/{len(data)} unequal {swap_type})')
plt.show()
