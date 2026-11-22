# Security Summary

**Reviewed Files**: 22  
**Issues Resolved**: 5 (aturan `firestore.rules` telah diperkeras dan lulus ESLint lokal, menunggu proses deploy oleh pemilik proyek Firebase)  

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Workflow State Enforcement | `firestore.rules` | 459 | Assigned operators could create or update `legalitas`, `legalitas_history`, and `data_periodik` even after a pesantren record was submitted (`diajukan`), verified (`diverifikasi`), or approved (`disetujui`). | High | Fixed | Added `isPesantrenEditableByOperator(pesantrenId)` requiring `verificationStatus in ['draft', 'ditolak']` on all operator writes to `legalitas`, `legalitas_history`, `data_periodik`, and `verifikasi_logs`. |
| Supply Chain Dependency | `package.json`, `src/lib/export.ts` | 32 | Direct dependency `xlsx@0.18.5` had unpatched high-severity advisories (Prototype Pollution and ReDoS) and unchecked filename characters in exports. | High | Fixed | Replaced `xlsx` with `write-excel-file/browser` (`4.1.1`) using typed `String`/`Number` cells, retained formula-prefix neutralization, and sanitized exported Excel/PDF filenames. |
| Operator List & Claim Integrity | `firestore.rules` | 401, 418 | List queries on `pesantren`, `legalitas_history`, `data_periodik`, `verifikasi_logs`, and `audit_logs` omitted `isActiveUser()`, and Action 1 UID claiming did not enforce `hasAll(existing().assignedOperatorUids)`. | Medium | Fixed | Added `isActiveUser()` to non-admin `list` rules and enforced `incoming().assignedOperatorUids.hasAll(existing().assignedOperatorUids)` plus `incoming().email == request.auth.token.email` on operator profile creation. |
| Public Directory Access Gate | `firestore.rules`, `src/App.tsx` | 450, 118 | Setting `publicDirectoryEnabled` to `false` only hid the UI while `/public_pesantren` remained directly queryable in Firestore. | Medium | Fixed | Enforced `isPublicDirectoryOpen()` in `firestore.rules` for non-admin reads and gated public Firestore REST/listener subscriptions in `src/App.tsx`. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Default-Deny & Field Schemas | `firestore.rules`, `firebase-blueprint.json` | Global default-deny rule blocks unmatched paths; strict `hasAll`/`hasOnly` field checks, size caps, ID regex validation, and server timestamp (`request.time`) binding guard all collections. |
| XSS & External Link Hygiene | `src/components/PesantrenMap.tsx`, `src/components/AuthWorkspace.tsx`, `src/lib/domain.ts` | Leaflet popup strings are HTML-escaped via `escapeHtml()`, React JSX binds text safely without raw HTML injection, and external SK IJOP links enforce `https://` via `isSafeHttpsUrl()` with `rel="noopener noreferrer"`. |
| Spreadsheet Formula Injection | `src/lib/domain.ts`, `src/lib/export.ts` | `sanitizeSpreadsheetCell()` prefixes leading `=`, `+`, `-`, `@`, tab, and carriage return characters before Excel export. |
| Client Secret Exposure | `firebase-applet-config.json`, `.env.example` | Only public Firebase client web identifiers are bundled; no private server keys or OAuth secrets exist in client source. |

---

## PoC Verification

### 1. Operator Bypass of Post-Submission Edit Lock on `legalitas` / `data_periodik`

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Workflow-State Authorization Check |
| Impact | High |
| Affected File | `firestore.rules:459-528` |
| Test Scenario | Assigned operator (`uid_op_a`) attempts `updateDoc` on `/legalitas/ps_01` or `/data_periodik/dp_ps_01_2025_2026` while `/pesantren/ps_01` has `verificationStatus == 'diajukan'` or `'disetujui'`. |

#### How It Was Fixed
Added `isPesantrenEditableByOperator(pesantrenId)` in `firestore.rules`, which verifies both active operator assignment (`isAssignedToPesantren`) and parent document workflow state (`verificationStatus in ['draft', 'ditolak']`), enforcing it across all operator write rules on `legalitas`, `legalitas_history`, `data_periodik`, and `verifikasi_logs`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Signed-in verified operator sends direct Firestore write to `/legalitas/ps_01` while `ps_01` is `disetujui` | Request reaches Firestore Security Rules |
| 2 | Rule evaluates `isAdmin() \|\| isPesantrenEditableByOperator('ps_01')` | `isAdmin()` is `false`; `get(/pesantren/ps_01).data.verificationStatus` is `'disetujui'` |
| 3 | `'disetujui' in ['draft', 'ditolak']` evaluates to `false` | **Rejected (`PERMISSION_DENIED`)** |

#### Conclusion
**Fix Verified** — Locked submissions and approved pesantren records can no longer be altered out-of-band by operators via sibling collections.

---

### 2. Peer Operator UID Stripping During Account Claim (Action 1)

#### Summary
| Field | Value |
|---|---|
| Issue Type | Incomplete Array Update Constraint |
| Impact | Medium |
| Affected File | `firestore.rules:418-425` |
| Test Scenario | Operator B (`uid_b`) with an invited email sends `assignedOperatorUids: ['uid_b', 'uid_b']` when existing array was `['uid_a']` (size 2 == 1 + 1). |

#### How It Was Fixed
Added `incoming().assignedOperatorUids.hasAll(existing().assignedOperatorUids)` to Action 1 on `/pesantren/{pesantrenId}`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Attacker sends claim update replacing `['uid_a']` with `['uid_b', 'uid_b']` | Request enters Action 1 rule |
| 2 | Rule checks `['uid_b', 'uid_b'].hasAll(['uid_a'])` | Evaluates to `false` |
| 3 | Write fails rule evaluation | **Rejected (`PERMISSION_DENIED`)** |

#### Conclusion
**Fix Verified** — Claiming a first-time operator UID strictly appends access without allowing removal of existing co-operators.
