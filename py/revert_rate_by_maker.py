import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
from utils import DELAYS, load_data

sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    args.add_argument('--url', type=str)
    return args.parse_args()

args = get_program_args()
data = load_data(args.path, args.url)
print(f'Loaded {len(data)} data items')

makers = sorted(set(
    o['makerAddress'] for o in itertools.chain(*(d['orders'] for d in data))
))
swaps_by_maker = {
    maker: [
        d for d in data
        if maker in set(o['makerAddress'] for o in d['orders'])
    ] for maker in makers
}
# Prune low count makers
makers = [m for m in makers if len(swaps_by_maker[m]) / len(data) >= 0.01]
print({ m: [o['feeRecipientAddress'] for o in swaps_by_maker[m][0]['orders'] if o['makerAddress'] == m][0] for m in makers })

sns.catplot(
    x='maker',
    y='revert rate',
    hue='delay',
    data=pd.DataFrame([
            [
                fr,
                min_delay,
                sum(1 for d in swaps_by_maker[fr]
                    if d['metadata']['swapResult']['revertData'] != '0x'
                    and d['metadata']['fillDelay'] >= min_delay
                    and d['metadata']['fillDelay'] < max_delay
                ) / max(1, sum(1 for d in swaps_by_maker[fr]
                    if d['metadata']['fillDelay'] >= min_delay
                    and d['metadata']['fillDelay'] < max_delay
                )),
            ] for fr, (min_delay, max_delay) in itertools.product(makers, DELAYS)
        ],
        columns=['maker', 'delay', 'revert rate'],
    ),
    kind='bar',
    legend=True,
    legend_out=False,
)

for t, (min_delay, max_delay) in zip(plt.gca().get_legend().texts, DELAYS):
    t.set_text(f'{min_delay}s')
counts_by_maker = {
    maker: len(swaps_by_maker[maker])
        for maker in makers
}
plt.xticks(plt.xticks()[0], [f'{fr[0:8]}... ({counts_by_maker[fr]})' for fr in makers])

plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'Revert rate by maker and delay ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
