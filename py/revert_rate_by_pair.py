import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
from utils import DELAYS, load_data, is_successful_swap

sns.set(color_codes=True)
sns.set_palette('muted')

def get_pair(swap):
    return '%s/%s' % (swap['metadata']['makerToken'], swap['metadata']['takerToken'])

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    args.add_argument('--url', type=str)
    return args.parse_args()

args = get_program_args()
data = load_data(args.path, args.url)
print(f'Loaded {len(data)} data items')

pairs = sorted(set(get_pair(d) for d in data))
print(f'Found {len(pairs)} pairs')

swap_by_pair = {
    p: [
        d for d in data if get_pair(d) == p
    ] for p in pairs
}

sns.catplot(
    x='pair',
    y='revert rate',
    hue='delay',
    data=pd.DataFrame([
            [
                pair,
                min_delay,
                sum(1 for s in swap_by_pair[pair]
                    if not is_successful_swap(s)
                    and s['metadata']['fillDelay'] >= min_delay
                    and s['metadata']['fillDelay'] < max_delay
                ) / sum(1 for s in swap_by_pair[pair]
                    if s['metadata']['fillDelay'] >= min_delay
                    and s['metadata']['fillDelay'] < max_delay
                ),
            ] for pair, (min_delay, max_delay) in itertools.product(pairs, DELAYS)
        ],
        columns=['pair', 'delay', 'revert rate'],
    ),
    kind='bar',
    legend_out=False,
    legend=True,
)

for t, (min_delay, max_delay) in zip(plt.gca().get_legend().texts, DELAYS):
    t.set_text(f'{min_delay}s')
plt.xticks(list(range(len(pairs))), pairs)
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'Revert rate by pair and delay ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
