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

fee_recipients = sorted(set(
    o['feeRecipientAddress'] for o in itertools.chain(*(d['orders'] for d in data))
))
swaps_by_fee_recipient = {
    fee_recipient: [
        d for d in data
        if fee_recipient in set(o['feeRecipientAddress'] for o in d['orders'])
    ] for fee_recipient in fee_recipients
}

sns.catplot(
    x='fee recipient',
    y='revert rate',
    hue='delay',
    data=pd.DataFrame([
            [
                fr,
                min_delay,
                sum(1 for d in swaps_by_fee_recipient[fr]
                    if d['metadata']['swapResult']['revertData'] != '0x'
                    and d['metadata']['fillDelay'] >= min_delay
                    and d['metadata']['fillDelay'] < max_delay
                ) / max(1, sum(1 for d in swaps_by_fee_recipient[fr]
                    if d['metadata']['fillDelay'] >= min_delay
                    and d['metadata']['fillDelay'] < max_delay
                )),
            ] for fr, (min_delay, max_delay) in itertools.product(fee_recipients, DELAYS)
        ],
        columns=['fee recipient', 'delay', 'revert rate'],
    ),
    kind='bar',
    legend=True,
    legend_out=False,
)

for t, (min_delay, max_delay) in zip(plt.gca().get_legend().texts, DELAYS):
    t.set_text(f'{min_delay}s')
counts_by_fee_recipient = {
    fee_recipient: len(swaps_by_fee_recipient[fee_recipient])
        for fee_recipient in fee_recipients
}
plt.xticks(plt.xticks()[0], [f'{fr[0:8]}... ({counts_by_fee_recipient[fr]})' for fr in fee_recipients])

plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
plt.title(f'Revert rate by fee recipient and delay ({len(data)} swaps)')
plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
plt.show()
