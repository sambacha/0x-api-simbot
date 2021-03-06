import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import pandas as pd
from utils import VALUES, DELAYS, load_data, format_value

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

metadata_by_prices = {
    max_value: [
        d['metadata'] for d in data
            if float(d['metadata']['fillValue']) >= min_value
            and float(d['metadata']['fillValue']) < max_value
    ] for min_value, max_value in VALUES
}

sns.catplot(
    x='swap value',
    y='revert rate',
    hue='delay',
    data=pd.DataFrame([
            [
                f'<{format_value(max_value)} ({len(metadata_by_prices[max_value])})',
                f'{min_delay}s',
                sum(1 for m in metadata_by_prices[max_value]
                    if m['swapResult']['revertData'] != '0x'
                    and m['fillDelay'] >= min_delay
                    and m['fillDelay'] < max_delay
                ) / max(1, sum(1 for m in metadata_by_prices[max_value]
                    if m['fillDelay'] >= min_delay
                    and m['fillDelay'] < max_delay
                )),
            ] for (min_value, max_value), (min_delay, max_delay)
                in itertools.product(VALUES, DELAYS)
        ],
        columns=['swap value', 'delay', 'revert rate'],
    ),
    kind='bar',
    legend=True,
    legend_out=False,
)

plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'Revert rate by swap value and delay ({len(data)} swaps)')
plt.legend()
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
