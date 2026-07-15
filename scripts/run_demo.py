"""Run the interactive StreamKill command-line demo sequence."""

import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add repo root to PATH to ensure clean package imports
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

try:
    from packages.privacy.consent import ConsentGate, ConsentAction, ConsentError
    from packages.privacy.redaction import redact_record, assert_no_secrets, SecretLeakError
    from packages.privacy.retention import RetentionPolicy
except ImportError as e:
    print(f"Error: Could not import privacy helper modules ({e}).")
    print("Please ensure your directory layout contains 'packages/privacy/'.")
    sys.exit(1)

# Paths to data assets
LEDGER_PATH = REPO_ROOT / "data/demo/demo_ledger.json"
RECEIPTS_PATH = REPO_ROOT / "data/demo/sample_receipts.redacted.json"
ROUTES_PATH = REPO_ROOT / "data/catalog/cancel_routes.seed.json"


def money(value: float) -> str:
    return f"${value:,.2f}"


def print_divider(char: str = "=", length: int = 60) -> None:
    print(char * length)


def simulate_spinner(message: str, seconds: float = 1.5) -> None:
    """Show a lightweight text-based loading indicator."""
    chars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    start = time.time()
    i = 0
    while time.time() - start < seconds:
        sys.stdout.write(f"\r{chars[i % len(chars)]} {message}")
        sys.stdout.flush()
        time.sleep(0.1)
        i += 1
    sys.stdout.write(f"\r✓ {message} Done!\n")
    sys.stdout.flush()


def main() -> None:
    print("\n=== STREAMKILL DEMO COMMAND CENTER ===")
    print("Trust Gate → Live Redaction → Consent Verification → Guarded Kill Room\n")

    # Initialize privacy controllers
    gate = ConsentGate()
    user_id = "demo-user-1"

    # ==========================================================
    # STEP 1: THE TRUST GATE (Scan Consent)
    # ==========================================================
    print("🔒 STEP 1: THE TRUST GATE")
    print_divider("-")
    print("StreamKill does not take blind control of your accounts.")
    print("We only scan for billing descriptors and cancellation links.")
    print_divider("-")
    
    consent_input = input("Grant permission to scan receipt evidence? (y/n): ").strip().lower()
    if consent_input != 'y':
        print("\nScan aborted by user. No action taken.")
        sys.exit(0)
    
    # Record the scan grant
    gate.grant(user_id, ConsentAction.SCAN)
    print("\n✓ Scan consent granted and logged in the append-only audit trail.")
    time.sleep(1)

    # ==========================================================
    # STEP 2: RECEIPT MINING & REDACTION CHECK
    # ==========================================================
    print("\n📥 STEP 2: RECEIPT MINING & PRIVACY HARDSHELL")
    print_divider("-")
    simulate_spinner("Locating receipt evidence fixtures...")
    
    # Load and run secret-leak assertions and redaction checks
    receipts_data = json.loads(RECEIPTS_PATH.read_text())
    
    simulate_spinner("Running 'assert_no_secrets' validation on raw evidence...")
    try:
        assert_no_secrets(receipts_data)
        print("✓ Security Check Passed: Zero unredacted keys, API tokens, or card profiles detected.")
    except SecretLeakError as e:
        print(f"❌ Security Violation: {e}", file=sys.stderr)
        sys.exit(1)

    simulate_spinner("Applying recursive PII masking engine...")
    redacted_receipts = redact_record(receipts_data)
    print("✓ Privacy Guard: All raw inbox records normalized and redacted.")
    time.sleep(1)

    # ==========================================================
    # STEP 3: LEAK LEDGER REVELATION
    # ==========================================================
    print("\n📊 STEP 3: THE LEAK LEDGER")
    print_divider()
    
    ledger = json.loads(LEDGER_PATH.read_text())
    summary = ledger["summary"]
    
    print(f"Detected monthly bleed: {money(summary['detected_monthly_bleed'])}")
    print(f"Detected annual bleed:  {money(summary['detected_annual_bleed'])}")
    print(f"Safe to kill value:     {money(summary['safe_to_kill_annual'])}")
    print(f"Needs review value:     {money(summary['requires_review_annual'])}")
    print(f"Blocked by policy:      {money(summary['blocked_by_policy_annual'])}")
    print_divider()

    # Verify user has consent to view ledger
    gate.grant(user_id, ConsentAction.VIEW_LEDGER)
    gate.require(user_id, ConsentAction.VIEW_LEDGER)

    print(f"{'SERVICE':<22} | {'MONTHLY':<8} | {'ANNUAL':<8} | {'SAFETY CATEGORY':<18}")
    print_divider("-")
    for sub in ledger["subscriptions"]:
        print(
            f"{sub['service']:<22} | "
            f"{money(sub['amount_monthly']):<8} | "
            f"{money(sub['amount_annual']):<8} | "
            f"{sub['safety_label']:<18}"
        )
    print_divider()
    input("\nPress [Enter] to generate the Guarded Kill Room Queue...")

    # ==========================================================
    # STEP 4: INTERACTIVE APPROVAL QUEUE
    # ==========================================================
    print("\n⚔️ STEP 4: THE GUARDED KILL ROOM QUEUE")
    print_divider("-")
    print("Approval to scan is NOT approval to cancel.")
    print("Review each candidate below and authorize StreamKill to act.")
    print_divider("-")

    approved_subs = []
    
    for sub in ledger["subscriptions"]:
        label = sub["safety_label"]
        service = sub["service"]
        sub_id = sub["id"]

        print(f"\n🔹 {service} ({money(sub['amount_annual'])}/yr)")
        
        if label == "Safe kill":
            print("  🟢 Safety: Safe Kill (Low-risk consumer streaming tier)")
            choice = input(f"  Authorize automated cancellation for {service}? (y/n): ").strip().lower()
            if choice == "y":
                gate.grant(user_id, ConsentAction.CANCEL_ITEM, target_id=sub_id)
                approved_subs.append(sub)
                print(f"  ✓ Added to approved cancellation pipeline.")
            else:
                print(f"  ⚠️ Skipped. Subscription will remain active.")

        elif label == "Confirm first":
            print("  🟡 Safety: Confirm First (Requires review - e.g. bundled or active billing)")
            print("  ⚠️ Notice: This service is Apple-billed or potentially shared.")
            choice = input(f"  Are you absolutely sure you want to queue cancellation? (y/n): ").strip().lower()
            if choice == "y":
                gate.grant(user_id, ConsentAction.CANCEL_ITEM, target_id=sub_id)
                approved_subs.append(sub)
                print(f"  ✓ Added to approved cancellation pipeline.")
            else:
                print(f"  ⚠️ Skipped. Subscription will remain active.")

        elif label == "Do not auto-kill":
            print("  🔴 Safety: Do Not Auto-Kill (PROTECTED SYSTEM BY SAFETY POLICY)")
            print("  🚨 CRITICAL RISK: Canceling cloud storage risks permanent loss of photos and data.")
            print("  🛑 Automation Engine: BLOCKED. Third-party automation is disabled for security.")
            time.sleep(0.5)

    if not approved_subs:
        print("\nNo subscriptions approved for cancellation. Exiting demo Room.")
        sys.exit(0)

    input(f"\nPress [Enter] to execute automation for {len(approved_subs)} approved cancellations...")

    # ==========================================================
    # STEP 5: THE CANCELLATION ENGINE (Guarded Browser Simulator)
    # ==========================================================
    print("\n🤖 STEP 5: RUNNING THE GUARDED BROWSER LAYER")
    print_divider()
    
    routes_data = json.loads(ROUTES_PATH.read_text())
    routes_map = {r["service"]: r for r in routes_data["routes"]}

    for sub in approved_subs:
        service = sub["service"]
        sub_id = sub["id"]
        
        print(f"\n🚀 Initiating cancellation for: {service}")
        
        # Enforce hard consent gate inside execution loop
        try:
            gate.require(user_id, ConsentAction.CANCEL_ITEM, target_id=sub_id)
            print("  [Consent Sentinel]: Verified. Active user approval confirmed.")
        except ConsentError as e:
            print(f"  [Consent Sentinel]: 🚨 BLOCKED! {e}", file=sys.stderr)
            continue

        route = routes_map.get(service)
        if not route:
            print("  ⚠️ Error: No structural cancellation playbook found in catalog seed.")
            continue

        print(f"  [Browser Route]: Opening {route['start_url']}")
        time.sleep(0.5)
        
        # Walk through the steps to show automated progress
        for i, step in enumerate(route["steps"], 1):
            if "PAUSE" in step or "final confirmation" in step.lower():
                print(f"  🛑 STEP {i}: {step}")
                print("  -------------------------------------------------------------")
                input("  [HUMAN INTERACTION GATE]: Press [Enter] to approve final cancel... ")
                print("  -------------------------------------------------------------")
            else:
                simulate_spinner(f"STEP {i}: {step}", seconds=0.8)

        print(f"  🎉 Successful cancellation run completed for {service}!")
        time.sleep(0.5)

    # ==========================================================
    # STEP 6: RETENTION SWEEP (24h Delete Enforcement)
    # ==========================================================
    print("\n🧹 STEP 6: RETENTION COMPLIANCE ENFORCEMENT")
    print_divider("-")
    
    # Instantiate Retention Policy and register some mock raw files
    retention = RetentionPolicy()
    
    # We pretend we generated a raw gmail cache file 25 hours ago
    expired_time = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    mock_raw_artifact = "data/scan-cache/raw_gmail_receipts.json"
    
    retention.register(mock_raw_artifact, kind="raw_scan", created_at_iso=expired_time)
    
    print("Active Policy: Delete all raw transaction traces within 24 hours.")
    simulate_spinner("Scanning storage caches for expired artifacts...")
    
    expired_files = retention.sweep(apply=False)  # Dry-run sweep to show user
    for f in expired_files:
        print(f"  🗑️ Scheduled for extraction deletion: {f} (TTL Expired: 24h)")
    
    print("✓ Retention Sweep successfully finalized.")
    time.sleep(1)

    # ==========================================================
    # STEP 7: PROOF OF SAVINGS RECEIPT
    # ==========================================================
    print("\n🧾 STEP 7: YOUR SAVINGS RECEIPT")
    print_divider()
    
    total_annual_saved = sum(s["amount_annual"] for s in approved_subs)
    
    print("SUCCESSFULLY CANCELED:")
    for s in approved_subs:
        print(f" - {s['service']}: Saved {money(s['amount_annual'])}/yr")
    
    print_divider("-")
    print(f"TOTAL RECOVERED: {money(total_annual_saved)} / year")
    print_divider()
    print("StreamKill: Subscription recovery completed cleanly with user-consent.")
    print_divider()


if __name__ == "__main__":
    main()
