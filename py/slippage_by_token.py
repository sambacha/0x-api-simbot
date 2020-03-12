import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
import decimal
from decimal import Decimal
from utils import VALUES, load_data, format_value, get_max_value, is_successful_swap

decimal.setcontext(decimal.Context(prec=64))

sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    args.add_argument('--url', type=str)
    return args.parse_args()

def get_slippage(swap_data):
    price = max(
        Decimal(o['makerAssetAmount']) / Decimal(o['takerAssetAmount']) for o in swap_data['orders']
    )
    filled_price = Decimal(swap_data['metadata']['swapResult']['boughtAmount']) / \
        Decimal(swap_data['metadata']['swapResult']['soldAmount'])
    return (filled_price - price) / price

args = get_program_args()
data = [d for d in load_data(args.path, args.url) if is_successful_swap(d)]
print(f'Loaded {len(data)} data items')

tokens = sorted(set([ *(d['metadata']['makerToken'] for d in data), *(d['metadata']['takerToken'] for d in data) ]))
sns.catplot(
    x='token',
    y='slippage',
    hue='swap value',
    data=pd.DataFrame([
            *([
                d['metadata']['takerToken'],
                get_max_value(d),
                float(get_slippage(d)),
            ] for d in data),
            *([
                d['metadata']['makerToken'],
                get_max_value(d),
                float(get_slippage(d)),
            ] for d in data)
        ],
        columns=['token', 'swap value', 'slippage'],
    ),
    kind='bar',
    errcolor='black',
    errwidth=1,
    capsize=.1,
    order=tokens,
    legend=True,
    legend_out=False,
)

for t, (min_value, max_value) in zip(plt.gca().get_legend().texts, VALUES):
    t.set_text(f'< {format_value(max_value)}')

counts_by_token = {
    t: sum(1 for d in data if d['metadata']['makerToken'] == t or d['metadata']['takerToken'] == t)
        for t in tokens
}
plt.xticks(plt.xticks()[0], ['%s (%d)' % (t, counts_by_token[t]) for t in tokens])

plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: '%.1f%%' % (y * 100)))
plt.title(f'Slippage by token and swap value ({len(data)} swaps)')
plt.ylabel('slippage (+ is good)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
