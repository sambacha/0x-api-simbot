import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
from ab_utils import load_ab_data
from utils import get_max_value, is_successful_swap, VALUES, format_value

sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    args.add_argument('--forwarder', action='store_true', help='only forwarder (ETH->X) swaps')
    args.add_argument('--tokens', type=str, help='whitelisted tokens')
    args.add_argument('--fees', action='store_true', help='include protocol fees')
    return args.parse_args()

args = get_program_args()
data = load_ab_data(args.path)
tokens = args.tokens.split(',') if args.tokens else None
print(f'Loaded {len(data)} data items')

costs_by_url_by_value = {}
urls = set()
for d in data:
    if not all(is_successful_swap(swap) for swap in d.values()):
        continue
    for url, swap in d.items():
        metadata = swap['metadata']
        if args.tokens:
            if metadata['makerToken'] not in tokens \
                or metadata['takerToken'] not in tokens:
                continue
        if args.forwarder:
            if metadata['takerToken'] != 'ETH':
                continue
        fees = 0
        if args.fees:
            # Can't differentiate fees from assets in the following scenarios.
            if metadata['makerToken'] == 'ETH':
                continue
            if metadata['side'] == 'buy' and metadata['takerToken'] == 'ETH':
                continue
            # Express fees in units of gas
            fees = int(swap['protocolFee']) - int(metadata['swapResult']['ethBalance'])
            fees = max(0, fees // int(swap['gasPrice']))
        costs_by_url_by_value[url] = costs_by_url_by_value.get(url, {})
        value = get_max_value(swap)
        costs_by_url_by_value[url][value] = costs_by_url_by_value[url].get(value, [])
        gas = metadata['swapResult']['gasUsed'] + fees
        costs_by_url_by_value[url][value].append(gas)
        urls.add(url)
urls = sorted(urls)

sns.catplot(
    x='value',
    y='gas used',
    hue='url',
    data=pd.DataFrame([
            [
                url,
                max_value,
                sum(costs_by_url_by_value[url].get(max_value, [])) /
                    (len(costs_by_url_by_value[url].get(max_value, [])) or 1)
            ] for url, (min_value, max_value) in itertools.product(urls, VALUES)
        ],
        columns=['url', 'value', 'gas used'],
    ),
    kind='bar',
    legend=True,
    legend_out=False
)

counts_by_value = {
    max_value: len(costs_by_url_by_value.get(urls[0], {}).get(max_value, [])) for (min_value, max_value) in VALUES
}
plt.xticks(
    list(range(len(VALUES))),
    [f'<{format_value(max_value)} ({counts_by_value[max_value]})' for (min_value, max_value) in VALUES],
)
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y / 1e3)}K'))
plt.title(f'A-B average gas used by value ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.075)
plt.show()
