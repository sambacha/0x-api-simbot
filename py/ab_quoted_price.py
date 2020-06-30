import matplotlib.ticker as ticker
from matplotlib import pyplot as plt
import seaborn as sns
import json
import argparse
import itertools
import decimal
from decimal import Decimal
from ab_utils import load_ab_data
from utils import is_successful_swap

decimal.setcontext(decimal.Context(prec=64))
sns.set(color_codes=True)
sns.set_palette('muted')

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('path', type=str)
    return args.parse_args()

def get_quote_price(swap):
    return float(swap['price'])

args = get_program_args()
data = [d for d in load_ab_data(args.path) if all(is_successful_swap(s) for s in d.values())]
print(f'Loaded {len(data)} data items')

BPS_STOPS = [1, 5, 10, 50, 100, 1000]

count_by_stop_by_url = {}
for d in data:
    best_swap_url = max(d.keys(), key=lambda k: get_quote_price(d[k]))
    worst_swap_url = min(d.keys(), key=lambda k: get_quote_price(d[k]))
    if best_swap_url == worst_swap_url:
        continue
    best_swap = d[best_swap_url]
    worst_swap = d[worst_swap_url]
    best_price = get_quote_price(best_swap)
    worst_price = get_quote_price(worst_swap)
    bps = (best_price - worst_price) / worst_price * 1000
    stop = None
    for s in BPS_STOPS:
        if bps < s:
            break
        stop = s
    if stop is None:
        continue
    count_by_stop_by_url[stop] = count_by_stop_by_url.get(stop, {})
    count_by_stop_by_url[stop][best_swap_url] = count_by_stop_by_url[stop].get(best_swap_url, 0)
    count_by_stop_by_url[stop][worst_swap_url] = count_by_stop_by_url[stop].get(worst_swap_url, 0)
    count_by_stop_by_url[stop][best_swap_url] += 1

stops = sorted(list(count_by_stop_by_url.keys()))
totals_by_stop = { stop: sum(count_by_stop_by_url[stop].values()) for stop in stops }
urls = sorted(list(list(count_by_stop_by_url.values())[0].keys()))
prev_ys = [0 for d in stops]
xs = list(range(len(stops)))
for url in urls:
    ys = [count_by_stop_by_url[stop][url] / totals_by_stop[stop] for stop in stops]
    plt.bar(xs, ys, bottom=prev_ys, label=url)
    prev_ys = [py + y for py, y in zip(prev_ys, ys)]

plt.legend()
plt.xticks(xs, [f'{stop}bps+ ({totals_by_stop[stop]})' for stop in stops])
plt.gca().yaxis.set_major_formatter(ticker.FuncFormatter(lambda y, pos: '%d%%' % (y * 100)))
plt.xlabel('winner\'s edge')
plt.ylabel('win rate')
plt.title(f'A-B quoted price win rate by edge ({sum(totals_by_stop.values())}/{len(data)} unequal swaps)')
plt.show()
