#!/usr/bin/env python3
"""Extract latest week data from Excel files and update the HTML report."""
import openpyxl
import json
import os
import re
from datetime import datetime

DATA_DIR = os.path.expanduser('~/Desktop/周报数据')
HTML_PATH = os.path.expanduser('~/chengdu-weekly-report/index.html')

# Map Excel files to JS variable names and column counts
FILE_MAP = {
    '贝壳二手/供销量价走势': {
        'var': 'OLD_SUPPLY_DEMAND', 'cols': ['week', 'new_listings', 'volume', 'list_price', 'deal_price']
    },
    '贝壳二手/看房次数': {
        'var': 'OLD_VIEWING', 'cols': ['week', 'viewings'],
        'pattern': '【买方情绪】看房次数'
    },
    '贝壳二手/房源_客源成交周期': {
        'var': 'OLD_CYCLE', 'cols': ['week', 'listing_days', 'customer_days']
    },
    '贝壳二手/需求量走势': {
        'var': 'OLD_DEMAND', 'cols': ['week', 'new_customers', 'visits', 'deals']
    },
    '贝壳新房/贝壳新房成交量价': {
        'var': 'NEW_VOLUME_PRICE', 'cols': ['week', 'volume', 'price']
    },
    '贝壳新房/贝壳新房渠道势能': {
        'var': 'NEW_CHANNEL', 'cols': ['week', 'projects', 'ratio']
    },
    '贝壳新房/贝壳渠道佣金点位': {
        'var': 'NEW_COMMISSION', 'cols': ['week', 'commission']
    },
    '贝壳新房/需求量走势': {
        'var': 'NEW_DEMAND', 'cols': ['week', 'new_customers', 'visits', 'deals']
    },
}

def find_latest_file(directory, pattern):
    """Find the latest Excel file matching pattern in directory."""
    full_dir = os.path.join(DATA_DIR, directory)
    if not os.path.exists(full_dir):
        return None
    
    matches = []
    for fname in os.listdir(full_dir):
        if pattern in fname and fname.endswith('.xlsx'):
            filepath = os.path.join(full_dir, fname)
            mtime = os.path.getmtime(filepath)
            matches.append((mtime, filepath))
    
    if not matches:
        return None
    
    # Return the most recently modified file
    matches.sort(reverse=True)
    return matches[0][1]

def extract_data(filepath):
    """Extract all data rows from Excel file."""
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    # Skip header row
    return [list(r) for r in rows[1:] if r[0]]

def main():
    results = {}
    
    for file_key, config in FILE_MAP.items():
        directory, file_pattern = file_key.rsplit('/', 1) if '/' in file_key else ('', file_key)
        latest = find_latest_file(directory, file_pattern)
        
        if not latest:
            print(f"WARNING: No file found for {file_key}")
            continue
        
        data = extract_data(latest)
        latest_row = data[-1] if data else None
        
        results[config['var']] = {
            'file': os.path.basename(latest),
            'total_rows': len(data),
            'latest_week': latest_row[0] if latest_row else None,
            'latest_data': latest_row,
            'all_data': data
        }
        
        print(f"{config['var']}: {os.path.basename(latest)} → latest={latest_row[0] if latest_row else 'N/A'} ({len(data)} rows)")
    
    # Save results for later use
    output_path = '/tmp/beike_extracted.json'
    # Convert to serializable format
    serializable = {}
    for var, info in results.items():
        serializable[var] = {
            'file': info['file'],
            'total_rows': info['total_rows'],
            'latest_week': info['latest_week'],
            'latest_data': [str(v) if isinstance(v, datetime) else v for v in (info['latest_data'] or [])],
            'all_data': [[str(v) if isinstance(v, datetime) else v for v in row] for row in info['all_data']]
        }
    
    with open(output_path, 'w') as f:
        json.dump(serializable, f, ensure_ascii=False, indent=2)
    
    print(f"\nData saved to {output_path}")
    return results

if __name__ == '__main__':
    main()
