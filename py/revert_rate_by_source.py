import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd

sns.set(color_codes=True)
sns.set_palette('muted')

def load_data(path):
    with open(path) as f:
        return [json.loads(line) for line in  f.readlines()]

DELAYS = [(0, 30), (30, 60), (60, 90), (90, 180), (180, 600)]

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    return args.parse_args()

args = get_program_args()
data = load_data(args.path)
print(f'Loaded {len(data)} data items')

sources = ['0x', 'bridge', 'native-mix', 'bridge-mix']
metadata_by_source = {
    s: [
        d['metadata'] for d in data
            if len(d['sources']) == 1 and d['sources'][0]['name'] == s
            or (s == 'bridge' and len(d['sources']) == 1 and d['sources'][0]['name'] != '0x')
            or (s == 'native-mix' and len(d['sources']) > 1 and '0x' in [s['name'] for s in d['sources']])
            or (s == 'bridge-mix' and len(d['sources']) > 1 and '0x' not in [s['name'] for s in d['sources']])
    ] for s in sources
}

sns.catplot(
    x='source',
    y='revert rate',
    hue='delay',
    data=pd.DataFrame([
            [
                f'{s} ({len(metadata_by_source[s])})',
                f'{min_delay}s',
                sum(1 for m in metadata_by_source[s]
                    if m['swapResult']['revertData'] != '0x'
                    and m['fillDelay'] >= min_delay
                    and m['fillDelay'] < max_delay
                ) / max(1, sum(1 for m in metadata_by_source[s]
                    if m['fillDelay'] >= min_delay
                    and m['fillDelay'] < max_delay
                )),
            ] for s, (min_delay, max_delay) in itertools.product(sources, DELAYS)
        ],
        columns=['source', 'delay', 'revert rate'],
    ),
    kind='bar',
    legend=True,
    legend_out=False,
)

plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'Revert rate by source and delay ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
