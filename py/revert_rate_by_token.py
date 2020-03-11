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

tokens = sorted(set(itertools.chain(
    (d['metadata']['makerToken'] for d in data),
    (d['metadata']['takerToken'] for d in data),
)))
print(f'Found {len(tokens)} tokens')

metadata_by_token = {
    t: [
        d['metadata'] for d in data
            if d['metadata']['makerToken'] == t or d['metadata']['takerToken'] == t
    ] for t in tokens
}

sns.catplot(
    x='token',
    y='revert rate',
    hue='delay',
    data=pd.DataFrame([
            [
                f'{t} ({len(metadata_by_token[t])})',
                f'{min_delay}s',
                sum(1 for m in metadata_by_token[t]
                    if m['swapResult']['revertData'] != '0x'
                    and m['fillDelay'] >= min_delay
                    and m['fillDelay'] < max_delay
                ) / sum(1 for m in metadata_by_token[t]
                    if m['fillDelay'] >= min_delay
                    and m['fillDelay'] < max_delay
                ),
            ] for t, (min_delay, max_delay) in itertools.product(tokens, DELAYS)
        ],
        columns=['token', 'delay', 'revert rate'],
    ),
    legend_out=False,
    legend=True,
    kind='bar',
)

plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'Revert rate by token and delay ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
