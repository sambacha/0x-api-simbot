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

def is_native_order(order):
    return order['makerAssetData'].startswith('0xf47261b0')

def was_frontrun(swap):
    orders = swap['orders']
    infos = swap['metadata']['swapResult']['orderInfos']
    sell_amount = int(swap['sellAmount'])
    taker_amount = sum(int(o['takerAssetAmount']) for o in orders)
    assert(sell_amount <= taker_amount)
    filled_amount = sum(int(oi['orderTakerAssetFilledAmount']) for oi in infos)
    return sell_amount < taker_amount - filled_amount

REASONS = ['expired', 'filled', 'cancelled', 'invalid', 'frontrun?', 'fillable']

def get_order_fail_reason(swap, order_idx):
    info = swap['metadata']['swapResult']['orderInfos'][order_idx]
    if info['orderStatus'] == 4:
        return 'expired'
    if info['orderStatus'] == 5:
        return 'filled'
    if info['orderStatus'] == 6:
        return 'cancelled'
    if info['orderStatus'] != 3:
        return 'invalid'
    if was_frontrun(swap):
        return 'frontrun?'
    return 'fillable'

args = get_program_args()
data = load_data(args.path)
print(f'Loaded {len(data)} data items')

failed_native_swaps = []
orders = []
for d in data:
    if d['metadata']['swapResult']['revertData'] != '0x':
        found_native_order = False
        for i, o in enumerate(d['orders']):
            found_native_order = True
            if is_native_order(o):
                orders.append({
                    'order': o,
                    'info': d['metadata']['swapResult']['orderInfos'][i],
                    'delay': d['metadata']['fillDelay'],
                    'reason': get_order_fail_reason(d, i)
                })
        if found_native_order:
            failed_native_swaps.append(d)

orders_by_reason_by_delay = {
    reason: {
        min_delay: [
            o for o in orders
            if o['delay'] >= min_delay
            and o['delay'] < max_delay
            and o['reason'] == reason
        ] for min_delay, max_delay in DELAYS
    } for reason in REASONS
}

reason_counts_by_delay = {
    min_delay: {
        r: sum(
            1 for o in orders
            if o['delay'] >= min_delay
            and o['delay'] < max_delay
            and o['reason'] == r
        ) for r in REASONS
    } for min_delay, max_delay in DELAYS
}
totals_by_delay = {
    min_delay: sum(
        reason_counts_by_delay[min_delay][r]
        for r in REASONS
    ) for min_delay, max_delay in DELAYS
}

prev_ys = [0 for d in DELAYS]
xs = list(range(len(DELAYS)))
for r in REASONS:
    ys = [reason_counts_by_delay[min_delay][r] / totals_by_delay[min_delay] for min_delay, max_delay in DELAYS]
    plt.bar(xs, ys, bottom=prev_ys, label=r)
    prev_ys = [py + y for py, y in zip(prev_ys, ys)]

plt.legend()
plt.xticks(plt.xticks()[0], ['', *(f'{min_delay}s+ ({totals_by_delay[min_delay]})' for min_delay, max_delay in DELAYS)])
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: '%d%%' % (y * 100)))
plt.xlabel('delay')
plt.ylabel('order state frequency')
plt.title(f'frequency of order state in failed native orders, by delay ({len(failed_native_swaps)} swaps)')
plt.show()

# metadata_by_source = {
#     s: [
#         d['metadata'] for d in data
#             if len(d['sources']) == 1 and d['sources'][0]['name'] == s
#             or (s == 'bridge' and len(d['sources']) == 1 and d['sources'][0]['name'] != '0x')
#             or (s == 'native-mix' and len(d['sources']) > 1 and '0x' in [s['name'] for s in d['sources']])
#             or (s == 'bridge-mix' and len(d['sources']) > 1 and '0x' not in [s['name'] for s in d['sources']])
#     ] for s in sources
# }
#
# sns.catplot(
#     x='source',
#     y='revert rate',
#     hue='delay',
#     data=pd.DataFrame([
#             [
#                 f'{s} ({len(metadata_by_source[s])})',
#                 f'{min_delay}s',
#                 sum(1 for m in metadata_by_source[s]
#                     if m['swapResult']['revertData'] != '0x'
#                     and m['fillDelay'] >= min_delay
#                     and m['fillDelay'] < max_delay
#                 ) / max(1, sum(1 for m in metadata_by_source[s]
#                     if m['fillDelay'] >= min_delay
#                     and m['fillDelay'] < max_delay
#                 )),
#             ] for s, (min_delay, max_delay) in itertools.product(sources, DELAYS)
#         ],
#         columns=['source', 'delay', 'revert rate'],
#     ),
#     kind='bar',
#     legend=True,
#     legend_out=False,
# )
#
# plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: f'{int(y * 100)}%'))
# plt.title(f'Revert rate by source and delay ({len(data)} swaps)')
# plt.subplots_adjust(top=0.9, right=0.95, left=0.05)
# plt.show()
