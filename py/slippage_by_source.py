import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
import decimal
from decimal import Decimal
from utils import DELAYS, VALUES, load_data, format_value, get_max_value, is_successful_swap

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

sources = sorted(set(itertools.chain(
    *[i for i in [
        [s['name'] for s in d['sources'] if s['name'] != '0x']
        for d in data
    ]],
)))
print(f'Found {len(sources)} sources')

data_by_source = {
    s: [
        d for d in data
            if len(d['sources']) == 1 and d['sources'][0]['name'] == s
    ] for s in sources
}

df_values = []
for s in sources:
    for d in data_by_source[s]:
        df_values.append([s, get_max_value(d), float(get_slippage(d))])

tokens = sorted(set([ *(d['metadata']['makerToken'] for d in data), *(d['metadata']['takerToken'] for d in data) ]))
sns.catplot(
    x='source',
    y='slippage',
    hue='swap value',
    data=pd.DataFrame(
        df_values,
        columns=['source', 'swap value', 'slippage'],
    ),
    kind='bar',
    errcolor='black',
    errwidth=1,
    capsize=.1,
    order=sources,
    legend=True,
    legend_out=False,
)

for t, (min_value, max_value) in zip(plt.gca().get_legend().texts, VALUES):
    t.set_text(f'< {format_value(max_value)}')
plt.xticks(plt.xticks()[0], ['%s (%d)' % (s, len(data_by_source[s])) for s in sources])

plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: '%.1f%%' % (y * 100)))
plt.title(f'Slippage by source and swap value ({len(data)} swaps)')
plt.ylabel('slippage (+ is good)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
