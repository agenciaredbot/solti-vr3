#!/usr/bin/env python3
"""Run a full growth pipeline orchestrating multiple skills.

Usage:
  python3 run_pipeline.py --config .tmp/pipeline_config.json --confirmed
  python3 run_pipeline.py --config .tmp/pipeline_config.json --dry-run

This orchestrator:
1. Reads pipeline config
2. Validates all steps
3. Executes sequentially, passing output from one step to the next
4. Saves intermediate results for crash recovery

Output: JSON with {success, pipeline_id, steps_completed, results}
"""

import argparse
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TMP_DIR = os.path.join(PLUGIN_DIR, '.tmp')

# Map skill+mode to actual script commands
STEP_COMMANDS = {
    'prospect:discover': {
        'script': 'skills/prospect/scripts/scrape_apify.py',
        'args_map': {
            'platform': '--platform',
            'query': '--query',
            'location': '--location',
            'max_results': '--max-results',
        },
        'output_key': 'scrape_results',
    },
    'prospect:enrich': {
        'script': 'skills/prospect/scripts/enrich_lead.py',
        'args_map': {
            'enrich': '--enrich',
        },
        'input_from': 'scrape_results',
        'output_key': 'enriched',
    },
    'prospect:score': {
        'script': 'skills/prospect/scripts/score_lead.py',
        'args_map': {},
        'input_from': 'enriched',
        'output_key': 'scored',
    },
    'crm:import': {
        'script': 'skills/crm/scripts/crm_local.py',
        'fixed_args': ['--action', 'import'],
        'args_map': {
            'min_score': '--min-score',
        },
        'input_from': 'scored',
        'output_key': 'imported',
    },
    'outreach:create': {
        'script': 'skills/outreach/scripts/generate_sequence.py',
        'args_map': {
            'channel': '--channel',
            'steps': '--steps',
        },
        'output_key': 'sequence',
    },
    'deploy:launch': {
        'script': 'skills/deploy/scripts/launch_campaign.py',
        'args_map': {
            'channel': '--channel',
            'sender_name': '--sender-name',
            'sender_email': '--sender-email',
        },
        'input_from_map': {
            'sequence': '--sequence',
            'imported': '--contacts',
        },
        'output_key': 'campaign',
        'requires_confirmation': True,
    },
}


def build_command(step_config: dict, pipeline_id: str,
                  intermediate_files: dict) -> list:
    """Build the command for a pipeline step."""
    key = f"{step_config['skill']}:{step_config['mode']}"
    cmd_spec = STEP_COMMANDS.get(key)

    if not cmd_spec:
        return None

    script = os.path.join(PLUGIN_DIR, cmd_spec['script'])
    cmd = ['python3', script]

    # Add fixed args
    cmd.extend(cmd_spec.get('fixed_args', []))

    # Map params to args
    params = step_config.get('params', {})
    for param, flag in cmd_spec.get('args_map', {}).items():
        if param in params:
            cmd.extend([flag, str(params[param])])

    # Add input from previous step(s)
    input_from = cmd_spec.get('input_from')
    if input_from and input_from in intermediate_files:
        cmd.extend(['--input', intermediate_files[input_from]])

    # Support multiple inputs mapped to different flags
    input_from_map = cmd_spec.get('input_from_map')
    if input_from_map:
        for key, flag in input_from_map.items():
            if key in intermediate_files:
                cmd.extend([flag, intermediate_files[key]])

    # Add output file
    output_key = cmd_spec.get('output_key', 'output')
    output_file = os.path.join(TMP_DIR, f'pipeline_{pipeline_id}_{output_key}.json')
    cmd.extend(['--output', output_file])

    # Add --confirmed for cost-bearing steps
    cmd.append('--confirmed')

    return cmd, output_key, output_file


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--config', required=True,
                        help='Pipeline config JSON file')
    parser.add_argument('--dry-run', action='store_true',
                        help='Validate and show plan without executing')
    parser.add_argument('--confirmed', action='store_true')
    args = parser.parse_args()

    try:
        with open(args.config) as f:
            config = json.load(f)

        pipeline_id = str(uuid.uuid4())[:8]
        pipeline_name = config.get('name', f'pipeline_{pipeline_id}')
        steps = config.get('steps', [])

        if not steps:
            print(json.dumps({
                'success': False,
                'error': 'No steps defined in pipeline config.',
            }))
            sys.exit(1)

        os.makedirs(TMP_DIR, exist_ok=True)

        # Dry run — just validate
        if args.dry_run:
            plan = []
            for i, step in enumerate(steps):
                key = f"{step['skill']}:{step['mode']}"
                plan.append({
                    'step': i + 1,
                    'skill': step['skill'],
                    'mode': step['mode'],
                    'known': key in STEP_COMMANDS,
                    'params': step.get('params', {}),
                    'requires_confirmation': STEP_COMMANDS.get(key, {}).get('requires_confirmation', False),
                })

            print(json.dumps({
                'success': True,
                'dry_run': True,
                'pipeline_id': pipeline_id,
                'name': pipeline_name,
                'total_steps': len(steps),
                'plan': plan,
            }, indent=2, ensure_ascii=False))
            return

        # Execute pipeline
        intermediate_files = {}
        results = []
        start_time = datetime.now()

        for i, step in enumerate(steps):
            step_num = i + 1
            key = f"{step['skill']}:{step['mode']}"

            print(json.dumps({
                'pipeline_progress': f'Step {step_num}/{len(steps)}',
                'skill': step['skill'],
                'mode': step['mode'],
            }), file=sys.stderr)

            cmd_result = build_command(step, pipeline_id, intermediate_files)
            if not cmd_result:
                results.append({
                    'step': step_num,
                    'skill': step['skill'],
                    'mode': step['mode'],
                    'status': 'skipped',
                    'reason': f'No command mapping for {key}',
                })
                continue

            cmd, output_key, output_file = cmd_result

            # Execute
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

            if proc.returncode == 0:
                intermediate_files[output_key] = output_file
                try:
                    step_output = json.loads(proc.stdout)
                except json.JSONDecodeError:
                    step_output = {'raw': proc.stdout[:500]}

                results.append({
                    'step': step_num,
                    'skill': step['skill'],
                    'mode': step['mode'],
                    'status': 'completed',
                    'output_file': output_file,
                    'summary': step_output,
                })
            else:
                error_output = proc.stderr or proc.stdout
                results.append({
                    'step': step_num,
                    'skill': step['skill'],
                    'mode': step['mode'],
                    'status': 'failed',
                    'error': error_output[:500],
                })
                # Stop pipeline on failure
                break

        elapsed = (datetime.now() - start_time).total_seconds()
        completed = sum(1 for r in results if r['status'] == 'completed')

        pipeline_result = {
            'success': completed == len(steps),
            'pipeline_id': pipeline_id,
            'name': pipeline_name,
            'total_steps': len(steps),
            'completed': completed,
            'failed': sum(1 for r in results if r['status'] == 'failed'),
            'skipped': sum(1 for r in results if r['status'] == 'skipped'),
            'elapsed_seconds': round(elapsed, 1),
            'results': results,
        }

        # Save pipeline record
        record_file = os.path.join(TMP_DIR, f'pipeline_{pipeline_id}.json')
        with open(record_file, 'w') as f:
            json.dump(pipeline_result, f, indent=2, ensure_ascii=False)

        print(json.dumps(pipeline_result, indent=2, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
