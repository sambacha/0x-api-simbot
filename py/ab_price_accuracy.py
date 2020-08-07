import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
from ab_utils import load_ab_data
from utils import VALUES, is_successful_swap, get_max_value, format_value

sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    return args.parse_args()

args = get_program_args()
data = [d for d in load_ab_data(args.path) if len(list(d.keys())) > 1]
print(f'Loaded {len(data)} data items')

urls = sorted(set(itertools.chain(*(d.keys() for d in data))))

sns.catplot(
    x='swap value',
    y='accuracy',
    hue='url',
    data=pd.DataFrame(
        [
            [
                url,
                float(d[url]['metadata']['swapResult']['boughtAmount'])/float(d[url]['buyAmount']) if d.get(url) else None,
                get_max_value(d[url]) if d.get(url) else None,
            ] for url, d in itertools.product(urls, data)
        ],
        columns=['url', 'accuracy', 'swap value'],
    ),
    kind='bar',
    errcolor='black',
    errwidth=1,
    capsize=.1,
    order=[max_value for min_value, max_value in VALUES],
    legend=True,
    legend_out=False,
)

for t, url in zip(plt.gca().get_legend().texts, urls):
    t.set_text(url)
plt.xticks(list(range(len(VALUES))), [f'< {format_value(max_value)}' for min_value, max_value in VALUES])

plt.title(f'A-B price accuracy time by swap value ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
