/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pop_launch.json`.
 */
export type PopLaunch = {
  "address": "Gj6B3nfzze1aZyYkmrk21LymU4oo1BFDEpa1s6NG2MXy",
  "metadata": {
    "name": "popLaunch",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Pop Launch: community-funded coin launches with escrowed SOL, atomic Raydium pool seeding, LP burn, claims and refunds"
  },
  "instructions": [
    {
      "name": "claimTokens",
      "docs": [
        "Transfer a wallet's remaining entitlement to that wallet's associated token account. Anyone may pay for it;",
        "nobody can redirect it. Claims never expire. Cumulative claimed amount is recorded before the transfer."
      ],
      "discriminator": [
        108,
        216,
        210,
        231,
        0,
        212,
        42,
        64
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone may sponsor a claim; tokens only ever go to the receipt owner's ATA."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          },
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "launch"
          ]
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "backerVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "ownerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "contribute",
      "docs": [
        "Commit SOL. Rejected whole if it exceeds the remaining target; the exact remainder may be below the minimum.",
        "Reaching the target flips the launch to READY in the same transaction."
      ],
      "discriminator": [
        82,
        33,
        68,
        131,
        32,
        0,
        205,
        95
      ],
      "accounts": [
        {
          "name": "backer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "backer"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createLaunch",
      "docs": [
        "Create the mint, mint the fixed supply into program vaults, revoke the mint authority, freeze the",
        "terms, fund the escrow's rent and the creator's setup reserve, pay the creation fee, and open funding."
      ],
      "discriminator": [
        239,
        223,
        255,
        134,
        39,
        121,
        127,
        62
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "The coin mint: created here, fully minted into program vaults, mint authority revoked, no freeze authority."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "auth",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "backerVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "feeRecipient",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createLaunchArgs"
            }
          }
        }
      ]
    },
    {
      "name": "expireLaunch",
      "docs": [
        "Convenience only: persist the derived REFUNDABLE state so indexers and UIs can read it. Not required for refunds."
      ],
      "discriminator": [
        98,
        30,
        30,
        129,
        233,
        249,
        51,
        187
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "finalizeLaunch",
      "docs": [
        "Permissionless settlement, strictly before the settlement deadline: wrap exactly the target SOL,",
        "create the Raydium CP-Swap pool with exactly the pool allocation, burn every LP token issued to the",
        "launch, verify the pool reserves, and mark LIVE. All or nothing."
      ],
      "discriminator": [
        113,
        133,
        62,
        196,
        58,
        212,
        118,
        166
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone: the operated keeper normally, or any backer if the keeper is late. Pays only the network fee."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "launch"
          ]
        },
        {
          "name": "auth",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "authQuote",
          "writable": true
        },
        {
          "name": "authLp",
          "writable": true
        },
        {
          "name": "cpSwapProgram"
        },
        {
          "name": "ammConfig"
        },
        {
          "name": "cpAuthority"
        },
        {
          "name": "poolState",
          "writable": true
        },
        {
          "name": "lpMint",
          "writable": true
        },
        {
          "name": "token0Vault",
          "writable": true
        },
        {
          "name": "token1Vault",
          "writable": true
        },
        {
          "name": "createPoolFee",
          "writable": true
        },
        {
          "name": "observationState",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeProtocol",
      "docs": [
        "One-time protocol configuration. The authority can only change settings for NEW launches and pause NEW launches."
      ],
      "discriminator": [
        188,
        233,
        252,
        106,
        134,
        146,
        202,
        91
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "settings",
          "type": {
            "defined": {
              "name": "launchSettings"
            }
          }
        }
      ]
    },
    {
      "name": "reclaimUnusedSetupReserve",
      "docs": [
        "After LIVE or REFUNDABLE the creator takes back whatever setup reserve was not consumed. Consumed pool and",
        "network costs, and the creation fee, are not returned. The authority keeps its own rent minimum."
      ],
      "discriminator": [
        52,
        3,
        68,
        141,
        33,
        56,
        24,
        238
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "auth",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "refund",
      "docs": [
        "Reclaim a wallet's entire accepted principal once the launch is refundable. Refundability is derived from",
        "chain time inside this call; no keeper is needed. Only the receipt owner can receive the lamports."
      ],
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone may trigger a refund; lamports only ever go to the receipt owner."
          ],
          "signer": true
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          },
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "relations": [
            "receipt"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setPaused",
      "docs": [
        "A global pause blocks NEW launches only; it cannot disable settlement, claims or refunds."
      ],
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "topUpSetupReserve",
      "docs": [
        "Anyone may add to the setup reserve without gaining any privilege."
      ],
      "discriminator": [
        70,
        184,
        224,
        53,
        49,
        53,
        146,
        127
      ],
      "accounts": [
        {
          "name": "funder",
          "writable": true,
          "signer": true
        },
        {
          "name": "launch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch.mint",
                "account": "launch"
              }
            ]
          }
        },
        {
          "name": "auth",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "launch"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateSettings",
      "docs": [
        "Versioned settings for launches created from now on. Never alters an existing launch."
      ],
      "discriminator": [
        81,
        166,
        51,
        213,
        158,
        84,
        157,
        108
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "settings",
          "type": {
            "defined": {
              "name": "launchSettings"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "contributionReceipt",
      "discriminator": [
        191,
        236,
        159,
        86,
        162,
        165,
        122,
        95
      ]
    },
    {
      "name": "launch",
      "discriminator": [
        144,
        51,
        51,
        163,
        206,
        85,
        213,
        38
      ]
    },
    {
      "name": "protocolConfig",
      "discriminator": [
        207,
        91,
        250,
        28,
        152,
        179,
        215,
        209
      ]
    }
  ],
  "events": [
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "contributed",
      "discriminator": [
        196,
        199,
        157,
        136,
        180,
        222,
        100,
        118
      ]
    },
    {
      "name": "launchCreated",
      "discriminator": [
        59,
        38,
        190,
        230,
        33,
        34,
        89,
        20
      ]
    },
    {
      "name": "launchLive",
      "discriminator": [
        206,
        172,
        115,
        190,
        36,
        200,
        163,
        93
      ]
    },
    {
      "name": "launchRefundable",
      "discriminator": [
        23,
        0,
        229,
        18,
        205,
        107,
        228,
        165
      ]
    },
    {
      "name": "refunded",
      "discriminator": [
        35,
        103,
        149,
        246,
        196,
        123,
        221,
        99
      ]
    },
    {
      "name": "setupReserveReclaimed",
      "discriminator": [
        88,
        181,
        98,
        111,
        52,
        188,
        20,
        102
      ]
    },
    {
      "name": "setupReserveToppedUp",
      "discriminator": [
        146,
        180,
        64,
        137,
        37,
        132,
        22,
        69
      ]
    },
    {
      "name": "targetReached",
      "discriminator": [
        149,
        209,
        57,
        9,
        106,
        52,
        127,
        219
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidSettings",
      "msg": "Invalid protocol settings"
    },
    {
      "code": 6001,
      "name": "paused",
      "msg": "New launches are paused"
    },
    {
      "code": 6002,
      "name": "invalidMetadata",
      "msg": "Invalid name, symbol or uri"
    },
    {
      "code": 6003,
      "name": "setupReserveTooLow",
      "msg": "Setup reserve below the required minimum"
    },
    {
      "code": 6004,
      "name": "invalidFeeRecipient",
      "msg": "Fee recipient does not match protocol settings"
    },
    {
      "code": 6005,
      "name": "notFunding",
      "msg": "Launch is not accepting contributions"
    },
    {
      "code": 6006,
      "name": "fundingClosed",
      "msg": "Funding window has closed"
    },
    {
      "code": 6007,
      "name": "zeroAmount",
      "msg": "Contribution must be positive"
    },
    {
      "code": 6008,
      "name": "exceedsRemaining",
      "msg": "Contribution exceeds the remaining target; nothing was taken"
    },
    {
      "code": 6009,
      "name": "belowMinimum",
      "msg": "Contribution below the minimum (unless it is the exact remainder)"
    },
    {
      "code": 6010,
      "name": "notReady",
      "msg": "Launch is not ready for settlement"
    },
    {
      "code": 6011,
      "name": "settlementExpired",
      "msg": "Settlement deadline has passed; the launch is refundable"
    },
    {
      "code": 6012,
      "name": "notLive",
      "msg": "Launch is not live"
    },
    {
      "code": 6013,
      "name": "notRefundable",
      "msg": "Launch is not refundable"
    },
    {
      "code": 6014,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6015,
      "name": "nothingToRefund",
      "msg": "Nothing to refund"
    },
    {
      "code": 6016,
      "name": "wrongDex",
      "msg": "Wrong DEX program or configuration"
    },
    {
      "code": 6017,
      "name": "wrongDexAccount",
      "msg": "Derived DEX account does not match"
    },
    {
      "code": 6018,
      "name": "wrongAta",
      "msg": "Wrong associated token account"
    },
    {
      "code": 6019,
      "name": "escrowShort",
      "msg": "Escrow balance below recorded obligations"
    },
    {
      "code": 6020,
      "name": "poolVaultShort",
      "msg": "Pool vault does not hold the full pool allocation"
    },
    {
      "code": 6021,
      "name": "reserveMismatch",
      "msg": "Pool reserves after seeding do not match the launch terms"
    },
    {
      "code": 6022,
      "name": "lpNotBurned",
      "msg": "LP tokens were not fully burned"
    },
    {
      "code": 6023,
      "name": "notCreator",
      "msg": "Only the creator may do this"
    },
    {
      "code": 6024,
      "name": "reserveLocked",
      "msg": "Setup reserve can only be reclaimed after the launch is live or refundable"
    },
    {
      "code": 6025,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "walletClaimedTotal",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "contributed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "walletTotal",
            "type": "u64"
          },
          {
            "name": "raised",
            "type": "u64"
          },
          {
            "name": "backerWallets",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "contributionReceipt",
      "docs": [
        "Nontransferable accounting account keyed by launch and wallet. Multiple contributions update one receipt."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "contributedLamports",
            "type": "u64"
          },
          {
            "name": "claimedBaseUnits",
            "type": "u64"
          },
          {
            "name": "refundedLamports",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "createLaunchArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "metadataHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "setupReserveLamports",
            "docs": [
              "Creator-funded reserve for pool and account costs (quoted client-side; must be >= the protocol minimum)."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "launch",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u16"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "state",
            "type": "u8"
          },
          {
            "name": "refundReason",
            "type": "u8"
          },
          {
            "name": "targetLamports",
            "type": "u64"
          },
          {
            "name": "supply",
            "type": "u64"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "backerAllocation",
            "type": "u64"
          },
          {
            "name": "poolAllocation",
            "type": "u64"
          },
          {
            "name": "settlementTimeoutSecs",
            "type": "i64"
          },
          {
            "name": "cpSwapProgram",
            "type": "pubkey"
          },
          {
            "name": "ammConfig",
            "type": "pubkey"
          },
          {
            "name": "createPoolFeeReceiver",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "creationFeePaid",
            "type": "u64"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "metadataHash",
            "docs": [
              "Hash of the finalized off-chain metadata (image, description, links). Frozen at opening."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "fundingDeadline",
            "type": "i64"
          },
          {
            "name": "filledAt",
            "type": "i64"
          },
          {
            "name": "settlementDeadline",
            "type": "i64"
          },
          {
            "name": "liveAt",
            "type": "i64"
          },
          {
            "name": "raisedLamports",
            "type": "u64"
          },
          {
            "name": "backerWallets",
            "type": "u32"
          },
          {
            "name": "totalClaimed",
            "type": "u64"
          },
          {
            "name": "totalRefunded",
            "type": "u64"
          },
          {
            "name": "setupReserveFunded",
            "type": "u64"
          },
          {
            "name": "setupReserveReclaimed",
            "type": "u64"
          },
          {
            "name": "poolState",
            "type": "pubkey"
          },
          {
            "name": "lpMint",
            "type": "pubkey"
          },
          {
            "name": "lpBurned",
            "type": "u64"
          },
          {
            "name": "settledQuote",
            "type": "u64"
          },
          {
            "name": "settledBase",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authBump",
            "type": "u8"
          },
          {
            "name": "escrowBump",
            "type": "u8"
          },
          {
            "name": "backerVaultBump",
            "type": "u8"
          },
          {
            "name": "poolVaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "launchCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u16"
          },
          {
            "name": "targetLamports",
            "type": "u64"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "fundingDeadline",
            "type": "i64"
          },
          {
            "name": "creationFee",
            "type": "u64"
          },
          {
            "name": "setupReserve",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "launchLive",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "poolState",
            "type": "pubkey"
          },
          {
            "name": "lpMint",
            "type": "pubkey"
          },
          {
            "name": "lpBurned",
            "type": "u64"
          },
          {
            "name": "quoteSeeded",
            "type": "u64"
          },
          {
            "name": "baseSeeded",
            "type": "u64"
          },
          {
            "name": "liveAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "launchRefundable",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "launchSettings",
      "docs": [
        "Versioned protocol settings. Copied into every launch at creation; changing them never alters an existing launch."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "targetLamports",
            "docs": [
              "Funding target in lamports (V1: 50 SOL)."
            ],
            "type": "u64"
          },
          {
            "name": "fundingWindowSecs",
            "docs": [
              "Funding window in seconds from on-chain opening (V1: 24h)."
            ],
            "type": "i64"
          },
          {
            "name": "settlementTimeoutSecs",
            "docs": [
              "Settlement timeout in seconds after the target is reached (V1: 60 minutes)."
            ],
            "type": "i64"
          },
          {
            "name": "supply",
            "docs": [
              "Fixed total supply in base units (V1: 1,000,000,000 × 10^6)."
            ],
            "type": "u64"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "backerAllocation",
            "docs": [
              "Backer allocation in base units (V1: 500,000,000 tokens)."
            ],
            "type": "u64"
          },
          {
            "name": "poolAllocation",
            "docs": [
              "Pool allocation in base units (V1: 500,000,000 tokens), paired with all target SOL."
            ],
            "type": "u64"
          },
          {
            "name": "creationFeeLamports",
            "docs": [
              "Platform creation fee in lamports, paid by the creator only when creation succeeds (V1: 0.1 SOL)."
            ],
            "type": "u64"
          },
          {
            "name": "minContributionLamports",
            "docs": [
              "Minimum contribution in lamports (V1: 0.01 SOL); the exact final remainder may be smaller."
            ],
            "type": "u64"
          },
          {
            "name": "minSetupReserveLamports",
            "docs": [
              "Minimum creator-funded setup reserve for pool/account costs."
            ],
            "type": "u64"
          },
          {
            "name": "feeRecipient",
            "docs": [
              "Receives the creation fee."
            ],
            "type": "pubkey"
          },
          {
            "name": "cpSwapProgram",
            "docs": [
              "Approved external AMM program (Raydium CP-Swap) and its config; verified on every settlement."
            ],
            "type": "pubkey"
          },
          {
            "name": "ammConfig",
            "type": "pubkey"
          },
          {
            "name": "createPoolFeeReceiver",
            "docs": [
              "Raydium's hardcoded pool-creation fee receiver token account."
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "docs": [
              "Quote mint (wrapped SOL)."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "protocolConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "Blocks NEW launches only. Existing settlement, claims and refunds are never affected."
            ],
            "type": "bool"
          },
          {
            "name": "version",
            "docs": [
              "Bumped on every settings change; launches record the version they were created under."
            ],
            "type": "u16"
          },
          {
            "name": "settings",
            "type": {
              "defined": {
                "name": "launchSettings"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "refunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "setupReserveReclaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "setupReserveToppedUp",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "targetReached",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "launch",
            "type": "pubkey"
          },
          {
            "name": "filledAt",
            "type": "i64"
          },
          {
            "name": "settlementDeadline",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
