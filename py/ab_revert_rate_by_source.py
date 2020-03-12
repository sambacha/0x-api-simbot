import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
from ab_utils import load_ab_data
from utils import get_min_delay, is_successful_swap

sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    return args.parse_args()

args = get_program_args()
data = load_ab_data(args.path)
print(f'Loaded {len(data)} data items')

counts_by_source_by_url = {}
for d in data:
    for url, swap in d.items():
        for source in swap['sources']:
            source = source['name']
            counts_by_source_by_url[source] = counts_by_source_by_url.get(source, {})
            counts_by_source_by_url[source][url] = \
                counts_by_source_by_url[source].get(url, { 'reverts': 0, 'total': 0 })
            if not is_successful_swap(swap):
                counts_by_source_by_url[source][url]['reverts'] += 1
            counts_by_source_by_url[source][url]['total'] += 1
urls = sorted(list(list(counts_by_source_by_url.values())[0].keys()))
sources = sorted(list(s for s in counts_by_source_by_url.keys() if set(counts_by_source_by_url[s].keys()) == set(urls)))

sns.catplot(
    x='source',
    y='revert rate',
    hue='url',
    data=pd.DataFrame([
            [
                url,
                source,
                counts_by_source_by_url[source][url]['reverts'] / counts_by_source_by_url[source][url]['total'],
            ] for url, source in itertools.product(urls, sources)
        ],
        columns=['url', 'source', 'revert rate'],
    ),
    kind='bar',
    legend=True,
    legend_out=False
)

counts_by_source = {
    source: sum(c['total'] for c in counts_by_source_by_url[source].values())
        for source in counts_by_source_by_url.keys()
}
plt.xticks(list(range(len(sources))), [f'{s} ({counts_by_source[s]})' for s in sources])
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'A-B revert rate by (included) source ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.075)
plt.show()
