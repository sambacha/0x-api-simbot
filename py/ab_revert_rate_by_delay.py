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

counts_by_delay_by_url = {}
for d in data:
    for url, swap in d.items():
        delay = get_min_delay(swap)
        counts_by_delay_by_url[delay] = counts_by_delay_by_url.get(delay, {})
        counts_by_delay_by_url[delay][url] = \
            counts_by_delay_by_url[delay].get(url, { 'reverts': 0, 'total': 0 })
        if not is_successful_swap(swap):
            counts_by_delay_by_url[delay][url]['reverts'] += 1
        counts_by_delay_by_url[delay][url]['total'] += 1
urls = sorted(list(list(counts_by_delay_by_url.values())[0].keys()))
delays = sorted(list(counts_by_delay_by_url.keys()))

sns.catplot(
    x='delay',
    y='revert rate',
    hue='url',
    data=pd.DataFrame([
            [
                url,
                min_delay,
                counts_by_delay_by_url[min_delay][url]['reverts'] / counts_by_delay_by_url[min_delay][url]['total'],
            ] for url, min_delay in itertools.product(urls, delays)
        ],
        columns=['url', 'delay', 'revert rate'],
    ),
    kind='bar',
    legend=True,
    legend_out=False
)

counts_by_delay = {
    delay: sum(c['total'] for c in counts_by_delay_by_url[delay].values())
        for delay in counts_by_delay_by_url.keys()
}
plt.xticks(
    list(range(len(delays))),
    [f'{min_delay}s ({counts_by_delay[min_delay]})' for min_delay in delays],
)
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'A-B revert rate by delay ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.075)
plt.show()
