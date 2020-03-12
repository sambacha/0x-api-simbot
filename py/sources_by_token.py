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

tokens = set()
for d in data:
   tokens.add(d['metadata']['makerToken'])
   tokens.add(d['metadata']['takerToken'])

counts_by_source_by_token = {}
for d in data:
    for source in [s['name'] for s in d['sources']]:
        counts_by_source_by_token[source] = counts_by_source_by_token.get(source, {})
        swap_tokens = (d['metadata']['makerToken'], d['metadata']['takerToken'])
        for token in tokens:
            counts_by_source_by_token[source][token] = counts_by_source_by_token[source].get(token, 0)
            counts_by_source_by_token[source][token] += 1 if token in swap_tokens else 0
sources = sorted(set(counts_by_source_by_token.keys()))
tokens = sorted(tokens)
totals_by_token = {
    token: sum(counts_by_source_by_token[s][token] for s in sources)
        for token in tokens
}

prev_ys = [0 for d in tokens]
xs = list(range(len(tokens)))
for s in sources:
    ys = [counts_by_source_by_token[s][t] / totals_by_token[t] for t in tokens]
    plt.bar(xs, ys, bottom=prev_ys, label=s)
    prev_ys = [py + y for py, y in zip(prev_ys, ys)]

plt.legend()
plt.xticks(list(range(len(tokens))), tokens)
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: '%d%%' % (y * 100)))
plt.xlabel('token')
plt.ylabel('source inclusion rate')
plt.title(f'frequency of sources included by token ({len(data)} swaps)')
plt.show()
