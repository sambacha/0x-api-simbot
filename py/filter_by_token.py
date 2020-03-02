import json
import argparse

def get_program_args():
    args = argparse.ArgumentParser()
    args.add_argument('--token', dest='tokens', action='append')
    args.add_argument('input', type=str)
    return args.parse_args()

def load_data(path):
    with open(path) as f:
        return [json.loads(line) for line in  f.readlines()]

args = get_program_args()
data = [
    d for d in load_data(args.input)
    if d['metadata']['makerToken'] in args.tokens
    and d['metadata']['takerToken'] in args.tokens
]
for d in data:
    print(json.dumps(d))
