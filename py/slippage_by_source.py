import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
import decimal
from decimal import Decimal

decimal.setcontext(decimal.Context(prec=64))

sns.set(color_codes=True)
sns.set_palette('muted')

def load_data(path):
    with open(path) as f:
        return [json.loads(line) for line in  f.readlines()]

DELAYS = [(0, 30), (30, 60), (60, 90), (90, 180), (180, 600)]
VALUES = [(0, 250), (250, 1000), (1000, 5000), (5000, 10000), (10000, 25000)]

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    return args.parse_args()

def format_value(value):
    if value >= 1000:
        return f'${value // 1000}K'
    return f'${value}'

def get_slippage(swap_data):
    price = Decimal(swap_data['orders'][0]['makerAssetAmount']) / \
        Decimal(swap_data['orders'][0]['takerAssetAmount'])
    filled_price = Decimal(swap_data['metadata']['swapResult']['boughtAmount']) / \
        Decimal(swap_data['sellAmount'])
    return (filled_price - price) / price

def get_max_value(swap_data):
    fill_value = float(swap_data['metadata']['fillValue'])
    for min_value, max_value in VALUES:
        if fill_value < max_value:
            return max_value
    return float('inf')

def is_valid_swap(swap_data):
    swap_result = swap_data['metadata']['swapResult']
    if swap_result['revertData'] != '0x':
        return False
    if swap_result['boughtAmount'] == '0':
        return False
    return True

args = get_program_args()
data = [d for d in load_data(args.path) if is_valid_swap(d)]
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
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
