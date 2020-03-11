import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
from utils import VALUES, load_data, get_max_value, format_value, is_successful_swap

sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    args.add_argument('--url', type=str)
    return args.parse_args()

args = get_program_args()
data = [d for d in load_data(args.path, args.url) if len(d['sources']) == 1 and is_successful_swap(d)]
print(f'Loaded {len(data)} data items')

sources = sorted(set(d['sources'][0]['name'] for d in data))
sns.catplot(
    x='source',
    y='gas used',
    hue='swap value',
    data=pd.DataFrame([
            [
                d['sources'][0]['name'],
                d['metadata']['swapResult']['gasUsed'],
                get_max_value(d)
            ] for d in data
        ],
        columns=['source', 'gas used', 'swap value'],
    ),
    kind='bar',
    order=sources,
    legend=True,
    legend_out=False,
)

for t, (min_value, max_value) in zip(plt.gca().get_legend().texts, VALUES):
    t.set_text(f'< {format_value(max_value)}')
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y / 1e3)}K'))
plt.xticks(
    list(range(len(sources))),
    ['%s (%d)' % (source, sum(1 for d in data if d['sources'][0]['name'] == source)) for source in sources],
)
plt.title(f'Gas used by source ({len(data)} single-source swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
