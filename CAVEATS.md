# Caveats: what this evidence does not prove

The on-chain facts are strong, but several things cannot be established from chain data alone. They are
stated plainly so the evidence is not over-read.

## Cannot be proven on-chain

- **Who controls the fresh wallets.** o1's in-app wallets have their keys generated and held by Turnkey
  (secure-enclave wallet infrastructure) and on Base are EIP-7702 accounts delegated to a ZeroDev Kernel
  smart-account implementation, claiming gaslessly. That means there is no funding transaction and no shared
  on-chain owner or validator to trace, so clustering the wallets to one named entity is not possible from
  chain data alone. The single-operator reading is a strong inference from converging structure (address
  sorted plus equal-sum batches, uniform wallet type, uniform inactivity, value concentration), not a proof
  of identity.
- **Who owns the distributor.** The contract is unverified and exposes no public owner getter, so the
  privileged address is not readable on-chain. `updateMerkleRoot`, `pause` and `withdraw` are standard
  distributor functions; their presence only means the allocation root is not strictly immutable, not that
  anything was changed or by whom.
- **Intent.** The structure is consistent with deliberate, planned construction, but intent is not something
  the chain records.
- **The off-chain allocation logic.** Who was assigned how much, and why, was decided off-chain and frozen
  into the Merkle root. The per-(address, amount) pairs are provable against the root, but the reasoning
  behind each allocation is not on-chain.

## Scope note

The analysis labels wallets only as fresh (nonce 0 at claim) or non-fresh (nonce greater than 0). "Non-fresh"
is a neutral factual label and is not claimed to mean "real independent user". Every headline figure is
scoped to the fresh cohort; nothing in the conclusions depends on labelling any non-fresh wallet.

## Weak or retracted claims (not relied on)

- "Fresh wallets dumped or sold": not supported. 99.96% of the received $O is still held; only 61 of 10,924
  ever moved a token.
- The 61 fresh wallets that did move any $O are not relied on for any conclusion. Claiming into a
  newly-created wallet is something some users do; that it occurred for these 61 is recorded as a fact, not
  used as evidence in either direction.
- A ZeroDev Kernel delegation by itself is not proof a wallet is part of the operation; it is a generic
  smart-account implementation used by many apps. This is why the suspect cohort is scoped to nonce 0.
