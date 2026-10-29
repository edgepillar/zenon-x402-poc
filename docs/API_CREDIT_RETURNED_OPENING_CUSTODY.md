# Returned-client custody during failed application opening

The fixed API-credit native opener may fail after its client and wallet have
returned, before the joined application returns. The former cleanup remembered
a clean client callback and later closed the budget file when the wallet stop
completed. It did not recheck that earlier client at the file-close boundary.

The actual `createApiCreditReturnedOpeningCustody` owner now supplies that
branch. It captures the same returned file/client/wallet owners, publishes its
one claim before invoking callbacks, requests both original stops independently
once, and revokes file admission. Stop results must be observable native
Promises with void completion. A returned joined application continues to own
its stops; this controller never competes with that application. Unreturned
client or wallet borrowers retain their separate conservative custody path.

Physical close requires both stop completions, a current revoked/unheld/idle
file, a fresh CLOSED/unheld/inactive client and a fresh CLOSED/unheld wallet
with its one observed clear. Both child views and the closed file view are
checked again after the one physical close returns void. A later inspection
cannot report clean custody using only cached completion flags. The actual
void file-close return remains a historical fact when a later view is unknown.

A throw, rejection, nonvoid result, unobservable Promise, stale child view or
uncertain file view retains HELD custody. A later clean view does not clear it.
Repeated identical claims join the original controller; rebinding the file to
a different client or wallet is refused. At most sixteen unknown frames are
retained; new claims are then refused before owner callbacks. No stop or file
close is retried. The controller exposes inspection only, with no reopening,
funding, signing, dispatch or release authority.

The native opener has no caller-selected cleanup factory. The source update
only replaces its returned-client/pre-application failure branch and adds the
fixed module to the existing RUN source catalog. Operational command grammar,
keyless inspection paths, data schema and the 108-control CI selection are
unchanged.

Qualification uses the actual pure custody controller with declared frozen
client/wallet/file views and manually completed in-memory Promises. Native
client construction, SDK/core loading, SQLite, wallet/key clear, transport,
signatures, nonce work, process interruption, reopen and physical release are
not executed. Source and DATA observations cannot close G1/G2 or Linux/native
acceptance. Funding ACK/grant/liability reconciliation remains a separate open
product requirement.
