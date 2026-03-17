#!/usr/bin/env python3
"""Local CRM using SQLite — standalone mode (no Hub required).

Usage:
  python3 crm_local.py --action list [--status hot|warm|cold|NEW|CONTACTED|...] [--limit 20]
  python3 crm_local.py --action search --query "bogota" [--limit 20]
  python3 crm_local.py --action create --data '{"first_name":"John",...}'
  python3 crm_local.py --action update --id <uuid> --data '{"status":"CONTACTED"}'
  python3 crm_local.py --action import --input scored.json [--min-score 60]
  python3 crm_local.py --action export [--status hot] --output export.csv
  python3 crm_local.py --action stats
  python3 crm_local.py --action get --id <uuid>

Database: data/contacts.db (SQLite, auto-created)
Output: JSON to stdout
"""

import argparse
import csv
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_DIR = os.path.join(PLUGIN_DIR, 'data')
DB_PATH = os.path.join(DB_DIR, 'contacts.db')


def get_db() -> sqlite3.Connection:
    """Get database connection, creating tables if needed."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            first_name TEXT,
            last_name TEXT,
            email TEXT,
            phone TEXT,
            whatsapp TEXT,
            instagram TEXT,
            linkedin TEXT,
            website TEXT,
            status TEXT NOT NULL DEFAULT 'NEW',
            score INTEGER DEFAULT 0,
            score_category TEXT DEFAULT 'cold',
            source TEXT,
            source_url TEXT,
            city TEXT,
            country TEXT,
            notes TEXT,
            custom_fields TEXT DEFAULT '{}',
            raw_data TEXT DEFAULT '{}',
            last_contacted_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            title TEXT,
            description TEXT,
            metadata TEXT DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
        CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(score DESC);
        CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
        CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id, created_at DESC);
    """)

    return conn


def now_iso() -> str:
    return datetime.now().isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def contact_to_dict(row: sqlite3.Row) -> dict:
    """Convert a database row to a dictionary."""
    d = dict(row)
    for json_field in ('custom_fields', 'raw_data'):
        if d.get(json_field):
            try:
                d[json_field] = json.loads(d[json_field])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


def action_list(conn: sqlite3.Connection, args) -> dict:
    """List contacts with optional filters."""
    query = "SELECT * FROM contacts"
    params = []
    conditions = []

    if args.status:
        status = args.status.upper()
        if status in ('HOT', 'WARM', 'COLD'):
            conditions.append("score_category = ?")
            params.append(status.lower())
        else:
            conditions.append("status = ?")
            params.append(status)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY score DESC, created_at DESC"
    query += f" LIMIT {args.limit or 50}"

    rows = conn.execute(query, params).fetchall()
    contacts = [contact_to_dict(r) for r in rows]

    return {"success": True, "count": len(contacts), "data": contacts}


def action_search(conn: sqlite3.Connection, args) -> dict:
    """Search contacts by text query."""
    if not args.query:
        return {"success": False, "error": "Search query required (--query)"}

    q = f"%{args.query}%"
    rows = conn.execute("""
        SELECT * FROM contacts
        WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
              OR city LIKE ? OR notes LIKE ? OR source LIKE ?
        ORDER BY score DESC
        LIMIT ?
    """, [q, q, q, q, q, q, args.limit or 50]).fetchall()

    contacts = [contact_to_dict(r) for r in rows]
    return {"success": True, "count": len(contacts), "query": args.query, "data": contacts}


def action_create(conn: sqlite3.Connection, args) -> dict:
    """Create a new contact."""
    if not args.data:
        return {"success": False, "error": "Contact data required (--data JSON)"}

    data = json.loads(args.data)
    contact_id = new_id()
    ts = now_iso()

    # Check for duplicate email
    if data.get('email'):
        existing = conn.execute(
            "SELECT id FROM contacts WHERE email = ?", [data['email']]
        ).fetchone()
        if existing:
            return {
                "success": False,
                "error": f"Contact with email {data['email']} already exists (id: {existing['id']})",
                "suggestion": "Use --action update to modify existing contact."
            }

    conn.execute("""
        INSERT INTO contacts (id, first_name, last_name, email, phone, whatsapp,
            instagram, linkedin, website, status, score, score_category,
            source, source_url, city, country, notes,
            custom_fields, raw_data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        contact_id,
        data.get('first_name', ''),
        data.get('last_name', ''),
        data.get('email', ''),
        data.get('phone', ''),
        data.get('whatsapp', ''),
        data.get('instagram', ''),
        data.get('linkedin', ''),
        data.get('website', ''),
        data.get('status', 'NEW'),
        data.get('score', 0),
        data.get('score_category', 'cold'),
        data.get('source', 'manual'),
        data.get('source_url', ''),
        data.get('city', ''),
        data.get('country', ''),
        data.get('notes', ''),
        json.dumps(data.get('custom_fields', {})),
        json.dumps(data.get('raw_data', {})),
        ts, ts,
    ])

    # Log activity
    conn.execute("""
        INSERT INTO activities (id, contact_id, type, title, created_at)
        VALUES (?, ?, 'created', 'Contact created', ?)
    """, [new_id(), contact_id, ts])

    conn.commit()

    return {"success": True, "id": contact_id, "action": "created"}


def action_update(conn: sqlite3.Connection, args) -> dict:
    """Update an existing contact."""
    if not args.id:
        return {"success": False, "error": "Contact ID required (--id)"}
    if not args.data:
        return {"success": False, "error": "Update data required (--data JSON)"}

    data = json.loads(args.data)
    ts = now_iso()

    # Build SET clause dynamically
    allowed = {'first_name', 'last_name', 'email', 'phone', 'whatsapp',
               'instagram', 'linkedin', 'website', 'status', 'score',
               'score_category', 'source', 'city', 'country', 'notes',
               'last_contacted_at'}

    sets = []
    params = []
    for key, value in data.items():
        if key in allowed:
            sets.append(f"{key} = ?")
            params.append(value)

    if not sets:
        return {"success": False, "error": "No valid fields to update."}

    sets.append("updated_at = ?")
    params.append(ts)
    params.append(args.id)

    conn.execute(f"UPDATE contacts SET {', '.join(sets)} WHERE id = ?", params)

    # Log activity
    changes = ", ".join(f"{k}={v}" for k, v in data.items() if k in allowed)
    conn.execute("""
        INSERT INTO activities (id, contact_id, type, title, description, created_at)
        VALUES (?, ?, 'updated', 'Contact updated', ?, ?)
    """, [new_id(), args.id, changes, ts])

    conn.commit()

    return {"success": True, "id": args.id, "action": "updated", "fields": list(data.keys())}


def action_get(conn: sqlite3.Connection, args) -> dict:
    """Get a single contact with activity timeline."""
    if not args.id:
        return {"success": False, "error": "Contact ID required (--id)"}

    row = conn.execute("SELECT * FROM contacts WHERE id = ?", [args.id]).fetchone()
    if not row:
        return {"success": False, "error": f"Contact not found: {args.id}"}

    contact = contact_to_dict(row)

    # Get activities
    activities = conn.execute(
        "SELECT * FROM activities WHERE contact_id = ? ORDER BY created_at DESC LIMIT 20",
        [args.id]
    ).fetchall()
    contact['activities'] = [dict(a) for a in activities]

    return {"success": True, "data": contact}


def action_import(conn: sqlite3.Connection, args) -> dict:
    """Bulk import contacts from JSON file."""
    if not args.input:
        return {"success": False, "error": "Input file required (--input)"}

    with open(args.input) as f:
        input_data = json.load(f)

    if isinstance(input_data, list):
        leads = input_data
    elif isinstance(input_data, dict) and 'data' in input_data:
        leads = input_data['data']
    else:
        leads = [input_data]

    min_score = args.min_score or 0
    imported = 0
    skipped_score = 0
    skipped_dup = 0
    ts = now_iso()

    for lead in leads:
        score = lead.get('score', 50)
        if score < min_score:
            skipped_score += 1
            continue

        # Check duplicate by email
        email = lead.get('email', '')
        if email:
            existing = conn.execute(
                "SELECT id FROM contacts WHERE email = ?", [email]
            ).fetchone()
            if existing:
                skipped_dup += 1
                continue

        # Map common field names
        name = lead.get('name', '') or lead.get('title', '')
        parts = name.split(' ', 1) if name else ['', '']
        first_name = lead.get('first_name', '') or parts[0]
        last_name = lead.get('last_name', '') or (parts[1] if len(parts) > 1 else '')

        contact_id = new_id()
        score_cat = 'hot' if score >= 80 else 'warm' if score >= 60 else 'cold'

        conn.execute("""
            INSERT INTO contacts (id, first_name, last_name, email, phone,
                website, instagram, linkedin, status, score, score_category,
                source, source_url, city, country, raw_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            contact_id, first_name, last_name,
            email,
            lead.get('phone', '') or lead.get('phoneNumber', '') or lead.get('telephone', ''),
            lead.get('website', '') or lead.get('url', '') or lead.get('webUrl', ''),
            lead.get('instagram', ''),
            lead.get('linkedin', ''),
            score, score_cat,
            lead.get('source', 'prospect'),
            lead.get('source_url', '') or lead.get('googleMapsUrl', ''),
            lead.get('city', '') or lead.get('address', ''),
            lead.get('country', ''),
            json.dumps(lead),
            ts, ts,
        ])
        imported += 1

    conn.commit()

    return {
        "success": True,
        "imported": imported,
        "skipped_low_score": skipped_score,
        "skipped_duplicate": skipped_dup,
        "total_processed": len(leads),
    }


def action_export(conn: sqlite3.Connection, args) -> dict:
    """Export contacts to CSV."""
    if not args.output:
        return {"success": False, "error": "Output file required (--output)"}

    query = "SELECT * FROM contacts"
    params = []

    if args.status:
        status = args.status.upper()
        if status in ('HOT', 'WARM', 'COLD'):
            query += " WHERE score_category = ?"
            params.append(status.lower())
        else:
            query += " WHERE status = ?"
            params.append(status)

    query += " ORDER BY score DESC"

    rows = conn.execute(query, params).fetchall()

    if not rows:
        return {"success": True, "count": 0, "message": "No contacts to export."}

    os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
    fields = ['id', 'first_name', 'last_name', 'email', 'phone', 'website',
              'status', 'score', 'score_category', 'source', 'city', 'country',
              'instagram', 'linkedin', 'notes', 'created_at']

    with open(args.output, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow(dict(row))

    return {"success": True, "count": len(rows), "output_file": args.output}


def action_stats(conn: sqlite3.Connection, args) -> dict:
    """Show CRM statistics."""
    total = conn.execute("SELECT COUNT(*) as c FROM contacts").fetchone()['c']

    status_counts = {}
    for row in conn.execute("SELECT status, COUNT(*) as c FROM contacts GROUP BY status"):
        status_counts[row['status']] = row['c']

    score_counts = {}
    for row in conn.execute("SELECT score_category, COUNT(*) as c FROM contacts GROUP BY score_category"):
        score_counts[row['score_category']] = row['c']

    source_counts = {}
    for row in conn.execute("SELECT source, COUNT(*) as c FROM contacts GROUP BY source ORDER BY c DESC LIMIT 5"):
        source_counts[row['source']] = row['c']

    avg_score = conn.execute("SELECT AVG(score) as avg FROM contacts").fetchone()['avg'] or 0

    return {
        "success": True,
        "total": total,
        "by_status": status_counts,
        "by_score": score_counts,
        "by_source": source_counts,
        "avg_score": round(avg_score, 1),
    }


ACTIONS = {
    'list': action_list,
    'search': action_search,
    'create': action_create,
    'update': action_update,
    'get': action_get,
    'import': action_import,
    'export': action_export,
    'stats': action_stats,
}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--action', required=True, choices=ACTIONS.keys(),
                        help='CRM operation to perform')
    parser.add_argument('--id', default=None, help='Contact ID (for get/update)')
    parser.add_argument('--data', default=None, help='JSON data (for create/update)')
    parser.add_argument('--query', default=None, help='Search query')
    parser.add_argument('--status', default=None, help='Filter by status or score category')
    parser.add_argument('--input', default=None, help='Input file for import')
    parser.add_argument('--output', default=None, help='Output file for export')
    parser.add_argument('--limit', type=int, default=50, help='Max results')
    parser.add_argument('--min-score', type=int, default=0, help='Min score for import')
    args = parser.parse_args()

    try:
        conn = get_db()
        result = ACTIONS[args.action](conn, args)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        conn.close()

    except json.JSONDecodeError as e:
        print(json.dumps({
            "success": False,
            "error": f"Invalid JSON in --data: {e}",
            "suggestion": "Ensure --data is valid JSON (use single quotes around it)."
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "suggestion": "Check command arguments and try again."
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
