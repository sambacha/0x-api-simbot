import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
from utils import DELAYS, load_data, is_successful_swap, get_min_delay

sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    args.add_argument('--url', type=str)
    args.add_argument('--includes', action='append')
    args.add_argument('--exclusive', action='store_true')
    args.add_argument('--only', type=str)
    return args.parse_args()

args = get_program_args()
data = load_data(args.path, args.url)
print(f'Loaded {len(data)} data items')

def is_allowed_source(s, all_sources):
    if args.only:
        return s == args.only and set(all_sources) == set([s])
    if args.exclusive:
        return s in all_sources and len(all_sources) == 1
    return args.includes is None or s in args.includes

counts_by_delay_by_source = {}
revert_rate_by_delay_by_source = {}
totals_by_source = {}
all_sources = set()
for d in data:
    delay = get_min_delay(d)
    counts_by_source = counts_by_delay_by_source[delay] = counts_by_delay_by_source.get(delay, {})
    revert_rate_by_source = revert_rate_by_delay_by_source[delay] = revert_rate_by_delay_by_source.get(delay, {})
    sources = [s['name'] for s in d['sources']]
    for s in (s for s in sources if is_allowed_source(s, sources)):
        all_sources.add(s)
        totals_by_source[s] = totals_by_source.get(s, 0) + 1
        counts = counts_by_source[s] = counts_by_source.get(s, {'reverts': 0, 'total': 0})
        counts['total'] += 1
        if d['metadata']['swapResult']['revertData'] != '0x':
            counts['reverts'] += 1
        revert_rate_by_source[s] = counts['reverts'] / counts['total']

sns.catplot(
    x='source',
    y='revert rate',
    hue='delay',
    data=pd.DataFrame([
            [
                f'{s} ({totals_by_source[s]})',
                f'{min_delay}s',
                revert_rate_by_delay_by_source.get(min_delay, {}).get(s, 0),
            ] for s, (min_delay, max_delay) in itertools.product(all_sources, DELAYS)
        ],
        columns=['source', 'delay', 'revert rate'],
    ),
    kind='bar',
    legend=True,
    legend_out=False,
)

plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'Revert rate by ({"exclusive" if args.only or args.exclusive else "included"}) source and delay ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
