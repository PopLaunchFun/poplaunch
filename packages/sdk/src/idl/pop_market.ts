/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pop_market.json`.
 */
export type PopMarket = {
  "address": "6pTC8K5PtUKGpQdHZoEsu26qLEehFDh2m1BLKRndNggx",
  "metadata": {
    "name": "popMarket",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "POP / Proof of Pain price-bin market: fee-funded nonwithdrawable liquidity at fixed price bins"
  },
  "instructions": [
    {
      "name": "activateMarket",
      "docs": [
        "Fund the seed quote, verify supply and authorities, activate. All checks fail atomically."
      ],
      "discriminator": [
        10,
        26,
        197,
        116,
        113,
        99,
        72,
        89
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "baseMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "creatorQuoteAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimFees",
      "docs": [
        "Claim protocol (kind 0) or creator (kind 1) revenue in the fee vault's mint to the",
        "published recipient. Permissionless crank; the destination owner is enforced."
      ],
      "discriminator": [
        82,
        251,
        233,
        156,
        12,
        52,
        184,
        202
      ],
      "accounts": [
        {
          "name": "protocolConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "kind",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createMarket",
      "docs": [
        "Create a coin market and its fixed-supply mint. Mints exactly `seed_base` into the locked",
        "base vault and revokes the mint authority immediately. No freeze authority is ever set."
      ],
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "baseMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "quoteMint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "baseMint"
              }
            ]
          }
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  98,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "feeVaultBase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  98,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "feeVaultQuote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createMarketArgs"
            }
          }
        }
      ]
    },
    {
      "name": "evaluateGraduation",
      "docs": [
        "Permissionless re-evaluation from stored counters (normally graduation happens inside matching)."
      ],
      "discriminator": [
        163,
        19,
        220,
        214,
        34,
        42,
        71,
        182
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "initializeBinPage",
      "docs": [
        "Permissionless lazy page creation: assigns the fixed seed schedule exactly once. Anyone",
        "(launcher, keeper or a trader whose route needs the page) may pay the rent."
      ],
      "discriminator": [
        154,
        74,
        5,
        50,
        171,
        30,
        94,
        21
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "page",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "arg",
                "path": "pageIndex"
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
          "name": "pageIndex",
          "type": "i32"
        }
      ]
    },
    {
      "name": "initializeProtocol",
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
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "buybackVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              }
            ]
          }
        },
        {
          "name": "buybackQuoteAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              },
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "quoteMint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeProtocolArgs"
            }
          }
        }
      ]
    },
    {
      "name": "matchBins",
      "docs": [
        "Permissionless, bounded: attempt matching on every bin of one page."
      ],
      "discriminator": [
        1,
        219,
        211,
        7,
        146,
        28,
        48,
        195
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "relations": [
            "page"
          ]
        },
        {
          "name": "page",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "setLaunchesEnabled",
      "discriminator": [
        154,
        154,
        45,
        27,
        10,
        192,
        65,
        216
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "protocolConfig"
          ]
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "enabled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setPopMint",
      "docs": [
        "Publish the external $POP mint once. Required before any buyback withdrawal."
      ],
      "discriminator": [
        199,
        37,
        166,
        207,
        198,
        52,
        93,
        226
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "protocolConfig"
          ]
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "popMint",
          "docs": [
            "The external $POP mint (must be a real SPL mint)."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "swapExactIn",
      "docs": [
        "Exact-input, fill-or-kill swap. Remaining accounts: the bin pages the route may touch,",
        "in traversal order (cursor page first)."
      ],
      "discriminator": [
        104,
        104,
        131,
        86,
        161,
        189,
        180,
        216
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "quoteVault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "feeVaultBase",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "feeVaultQuote",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "userBase",
          "writable": true
        },
        {
          "name": "userQuote",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "swapArgs"
            }
          }
        }
      ]
    },
    {
      "name": "sweepBuybackFunds",
      "docs": [
        "Permissionless: move a market's buyback earmark to the protocol buyback escrow."
      ],
      "discriminator": [
        69,
        57,
        80,
        183,
        37,
        21,
        176,
        98
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "feeVaultQuote",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "buybackVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              }
            ]
          }
        },
        {
          "name": "buybackQuoteAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "withdrawBuybackFunds",
      "docs": [
        "Bounded withdrawal of realized buyback escrow to the buyback authority's OWN WSOL ATA, so",
        "the keeper can execute the buy-and-burn of the external $POP mint in the same transaction",
        "(Jupiter swap + SPL burn). Cap, minimum interval and a published POP mint are required."
      ],
      "discriminator": [
        2,
        83,
        143,
        135,
        82,
        151,
        151,
        138
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "buybackVault"
          ]
        },
        {
          "name": "protocolConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "buybackVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  121,
                  98,
                  97,
                  99,
                  107
                ]
              }
            ]
          }
        },
        {
          "name": "buybackQuoteAccount",
          "writable": true
        },
        {
          "name": "destination",
          "docs": [
            "Destination is fixed to the authority's own WSOL associated token account."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
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
                "path": "quoteMint"
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
          "name": "quoteMint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "binPage",
      "discriminator": [
        73,
        19,
        198,
        239,
        171,
        123,
        30,
        35
      ]
    },
    {
      "name": "buybackVault",
      "discriminator": [
        153,
        166,
        71,
        144,
        179,
        189,
        137,
        251
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
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
      "name": "bandHardened",
      "discriminator": [
        118,
        255,
        211,
        247,
        208,
        9,
        94,
        78
      ]
    },
    {
      "name": "buybackSwept",
      "discriminator": [
        218,
        138,
        72,
        190,
        91,
        133,
        244,
        31
      ]
    },
    {
      "name": "buybackWithdrawn",
      "discriminator": [
        133,
        189,
        155,
        159,
        201,
        249,
        72,
        42
      ]
    },
    {
      "name": "feesClaimed",
      "discriminator": [
        22,
        104,
        110,
        222,
        38,
        157,
        14,
        62
      ]
    },
    {
      "name": "graduated",
      "discriminator": [
        51,
        241,
        66,
        50,
        140,
        245,
        156,
        192
      ]
    },
    {
      "name": "launchesToggled",
      "discriminator": [
        53,
        152,
        86,
        20,
        59,
        211,
        141,
        228
      ]
    },
    {
      "name": "marketActivated",
      "discriminator": [
        196,
        73,
        78,
        48,
        187,
        132,
        107,
        11
      ]
    },
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "pageInitialized",
      "discriminator": [
        25,
        101,
        79,
        128,
        45,
        218,
        5,
        153
      ]
    },
    {
      "name": "popMintSet",
      "discriminator": [
        132,
        9,
        111,
        30,
        28,
        51,
        77,
        177
      ]
    },
    {
      "name": "protocolInitialized",
      "discriminator": [
        173,
        122,
        168,
        254,
        9,
        118,
        76,
        132
      ]
    },
    {
      "name": "scarFormed",
      "discriminator": [
        186,
        170,
        152,
        150,
        136,
        199,
        49,
        57
      ]
    },
    {
      "name": "swapExecuted",
      "discriminator": [
        150,
        166,
        26,
        225,
        28,
        89,
        38,
        79
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6001,
      "name": "invalidConfig",
      "msg": "Invalid market configuration"
    },
    {
      "code": 6002,
      "name": "priceTooSmall",
      "msg": "Reference price too small to represent (p0_x64 < 2^32)"
    },
    {
      "code": 6003,
      "name": "priceRange",
      "msg": "Price table overflow or zero price at range extreme"
    },
    {
      "code": 6004,
      "name": "marketNotActive",
      "msg": "Market is not active"
    },
    {
      "code": 6005,
      "name": "marketNotCreated",
      "msg": "Market is not in the created state"
    },
    {
      "code": 6006,
      "name": "marketAlreadyActive",
      "msg": "Market is already active"
    },
    {
      "code": 6007,
      "name": "inputBelowMinimum",
      "msg": "Gross input below configured minimum"
    },
    {
      "code": 6008,
      "name": "zeroTradable",
      "msg": "Tradable input is zero after fees"
    },
    {
      "code": 6009,
      "name": "traversalLimit",
      "msg": "Traversal limit reached before input was filled"
    },
    {
      "code": 6010,
      "name": "buyInventoryExhausted",
      "msg": "Buy-side token inventory exhausted at the range limit"
    },
    {
      "code": 6011,
      "name": "sellInventoryExhausted",
      "msg": "Sell-side quote inventory exhausted at the range limit"
    },
    {
      "code": 6012,
      "name": "pageNotProvided",
      "msg": "Required bin page account was not provided"
    },
    {
      "code": 6013,
      "name": "pageNotInitialized",
      "msg": "Bin page is not initialized"
    },
    {
      "code": 6014,
      "name": "invalidPage",
      "msg": "Bin page does not belong to this market or has an invalid address"
    },
    {
      "code": 6015,
      "name": "pageOutOfRange",
      "msg": "Page index out of range"
    },
    {
      "code": 6016,
      "name": "outputBelowMinimum",
      "msg": "Output below min_output"
    },
    {
      "code": 6017,
      "name": "deadlinePassed",
      "msg": "Deadline slot passed"
    },
    {
      "code": 6018,
      "name": "configVersionMismatch",
      "msg": "Config version mismatch"
    },
    {
      "code": 6019,
      "name": "noExecutableFill",
      "msg": "No executable fill"
    },
    {
      "code": 6020,
      "name": "seedExceeded",
      "msg": "Seed schedule exceeds unmaterialized balance"
    },
    {
      "code": 6021,
      "name": "invalidQuoteMint",
      "msg": "Quote mint must be canonical wrapped SOL"
    },
    {
      "code": 6022,
      "name": "invalidVault",
      "msg": "Invalid vault account"
    },
    {
      "code": 6023,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account owner or mint"
    },
    {
      "code": 6024,
      "name": "tokenAccountDelegated",
      "msg": "Token account has a delegate or close authority; rejected"
    },
    {
      "code": 6025,
      "name": "mintAuthorityPresent",
      "msg": "Mint has an authority that must be absent"
    },
    {
      "code": 6026,
      "name": "supplyMismatch",
      "msg": "Mint supply does not equal the committed allocation"
    },
    {
      "code": 6027,
      "name": "seedQuoteNotFunded",
      "msg": "Seed quote not funded"
    },
    {
      "code": 6028,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6029,
      "name": "launchesDisabled",
      "msg": "New market creation is disabled"
    },
    {
      "code": 6030,
      "name": "nothingToClaim",
      "msg": "Nothing claimable"
    },
    {
      "code": 6031,
      "name": "buybackWithdrawCap",
      "msg": "Buyback withdrawal exceeds cap or realized funds"
    },
    {
      "code": 6032,
      "name": "seedQuoteBelowMinimum",
      "msg": "Seed quote below the factory minimum"
    },
    {
      "code": 6033,
      "name": "popMintAlreadySet",
      "msg": "POP mint already published"
    },
    {
      "code": 6034,
      "name": "popMintNotSet",
      "msg": "POP mint not published yet"
    },
    {
      "code": 6035,
      "name": "buybackInterval",
      "msg": "Buyback interval not elapsed"
    },
    {
      "code": 6036,
      "name": "invalidMetadata",
      "msg": "Invalid metadata string"
    },
    {
      "code": 6037,
      "name": "invalidClaimDestination",
      "msg": "Invalid fee claim destination"
    },
    {
      "code": 6038,
      "name": "invariant",
      "msg": "Bin inventory invariant violated"
    }
  ],
  "types": [
    {
      "name": "bandHardened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "band",
            "type": "i32"
          },
          {
            "name": "pairedQuote",
            "type": "u64"
          },
          {
            "name": "hardenedBands",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "bin",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seedBase",
            "type": "u64"
          },
          {
            "name": "seedQuote",
            "type": "u64"
          },
          {
            "name": "scarBase",
            "type": "u64"
          },
          {
            "name": "scarQuote",
            "type": "u64"
          },
          {
            "name": "pendingBaseEligible",
            "type": "u64"
          },
          {
            "name": "pendingQuoteEligible",
            "type": "u64"
          },
          {
            "name": "buyVolumeQuote",
            "type": "u64"
          },
          {
            "name": "sellVolumeBase",
            "type": "u64"
          },
          {
            "name": "pairedQuoteLifetime",
            "type": "u64"
          },
          {
            "name": "lastExecutionSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "binPage",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "pageIndex",
            "type": "i32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "bins",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "bin"
                  }
                },
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "buybackSwept",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
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
      "name": "buybackVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Keeper/multisig allowed to withdraw bounded amounts to its own WSOL ATA for off-program execution."
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteAccount",
            "type": "pubkey"
          },
          {
            "name": "totalReceived",
            "type": "u64"
          },
          {
            "name": "totalWithdrawn",
            "type": "u64"
          },
          {
            "name": "lastWithdrawalSlot",
            "type": "u64"
          },
          {
            "name": "minIntervalSlots",
            "type": "u64"
          },
          {
            "name": "maxWithdrawPerExecution",
            "type": "u64"
          },
          {
            "name": "withdrawalCount",
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
      "name": "buybackWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "popMint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "createMarketArgs",
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
            "name": "seedBase",
            "type": "u64"
          },
          {
            "name": "seedQuote",
            "docs": [
              "Creator-chosen seed quote (WSOL atomic), >= factory minimum. Locked at activation."
            ],
            "type": "u64"
          },
          {
            "name": "decimals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "factorySettings",
      "docs": [
        "Factory defaults applied to markets created under this config version."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "minSeedQuote",
            "docs": [
              "Minimum seed quote (WSOL atomic) a creator must lock per coin. The creator chooses the amount."
            ],
            "type": "u64"
          },
          {
            "name": "scarFeeBps",
            "type": "u16"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          },
          {
            "name": "creatorFeeBps",
            "type": "u16"
          },
          {
            "name": "buybackShareBps",
            "type": "u16"
          },
          {
            "name": "maturityQuoteTarget",
            "type": "u64"
          },
          {
            "name": "bandQuoteTarget",
            "type": "u64"
          },
          {
            "name": "bandsRequired",
            "type": "u16"
          },
          {
            "name": "minQuoteIn",
            "type": "u64"
          },
          {
            "name": "minBaseIn",
            "type": "u64"
          },
          {
            "name": "binMin",
            "type": "i32"
          },
          {
            "name": "binMax",
            "type": "i32"
          },
          {
            "name": "maxBinsPerSwap",
            "type": "u8"
          },
          {
            "name": "bandSize",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "feesClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "graduated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "pairedQuoteLifetime",
            "type": "u64"
          },
          {
            "name": "hardenedBands",
            "type": "u16"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "initializeProtocolArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "protocolFeeRecipient",
            "type": "pubkey"
          },
          {
            "name": "buybackAuthority",
            "type": "pubkey"
          },
          {
            "name": "settings",
            "type": {
              "defined": {
                "name": "factorySettings"
              }
            }
          },
          {
            "name": "buybackMinIntervalSlots",
            "type": "u64"
          },
          {
            "name": "buybackMaxWithdrawPerExecution",
            "type": "u64"
          },
          {
            "name": "launchesEnabled",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "launchesToggled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "enabled",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "baseVault",
            "type": "pubkey"
          },
          {
            "name": "quoteVault",
            "type": "pubkey"
          },
          {
            "name": "feeVaultBase",
            "type": "pubkey"
          },
          {
            "name": "feeVaultQuote",
            "type": "pubkey"
          },
          {
            "name": "p0X64",
            "type": "u128"
          },
          {
            "name": "binMin",
            "type": "i32"
          },
          {
            "name": "binMax",
            "type": "i32"
          },
          {
            "name": "binsPerPage",
            "type": "u8"
          },
          {
            "name": "bandSize",
            "type": "u8"
          },
          {
            "name": "maxBinsPerSwap",
            "type": "u8"
          },
          {
            "name": "cursor",
            "type": "i32"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "configVersion",
            "type": "u32"
          },
          {
            "name": "scarFeeBps",
            "type": "u16"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          },
          {
            "name": "creatorFeeBps",
            "type": "u16"
          },
          {
            "name": "buybackShareBps",
            "type": "u16"
          },
          {
            "name": "maturityQuoteTarget",
            "type": "u64"
          },
          {
            "name": "bandQuoteTarget",
            "type": "u64"
          },
          {
            "name": "bandsRequired",
            "type": "u16"
          },
          {
            "name": "minQuoteIn",
            "type": "u64"
          },
          {
            "name": "minBaseIn",
            "type": "u64"
          },
          {
            "name": "baseDecimals",
            "type": "u8"
          },
          {
            "name": "seedBaseTotal",
            "type": "u64"
          },
          {
            "name": "seedQuoteTotal",
            "type": "u64"
          },
          {
            "name": "unmaterializedSeedBase",
            "type": "u64"
          },
          {
            "name": "unmaterializedSeedQuote",
            "type": "u64"
          },
          {
            "name": "pairedQuoteLifetime",
            "type": "u64"
          },
          {
            "name": "hardenedBands",
            "type": "u16"
          },
          {
            "name": "bandPairedQuote",
            "type": {
              "array": [
                "u64",
                64
              ]
            }
          },
          {
            "name": "bandHardenedBits",
            "docs": [
              "Bit i set when band (min_band + i) has crossed the band target."
            ],
            "type": "u64"
          },
          {
            "name": "protocolClaimableBase",
            "type": "u64"
          },
          {
            "name": "protocolClaimableQuote",
            "type": "u64"
          },
          {
            "name": "creatorClaimableBase",
            "type": "u64"
          },
          {
            "name": "creatorClaimableQuote",
            "type": "u64"
          },
          {
            "name": "buybackAccruedQuote",
            "type": "u64"
          },
          {
            "name": "totalBuyVolumeQuote",
            "type": "u64"
          },
          {
            "name": "totalSellVolumeBase",
            "type": "u64"
          },
          {
            "name": "swapCount",
            "type": "u64"
          },
          {
            "name": "createdAtSlot",
            "type": "u64"
          },
          {
            "name": "activatedAtSlot",
            "type": "u64"
          },
          {
            "name": "activatedAtTs",
            "type": "i64"
          },
          {
            "name": "graduatedAtSlot",
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
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketActivated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "unixTs",
            "type": "i64"
          },
          {
            "name": "supply",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "seedBase",
            "type": "u64"
          },
          {
            "name": "seedQuote",
            "type": "u64"
          },
          {
            "name": "p0X64",
            "type": "u128"
          },
          {
            "name": "configVersion",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "pageInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "pageIndex",
            "type": "i32"
          },
          {
            "name": "seedBase",
            "type": "u64"
          },
          {
            "name": "seedQuote",
            "type": "u64"
          },
          {
            "name": "payer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "popMintSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "popMint",
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
            "name": "version",
            "type": "u32"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "protocolFeeRecipient",
            "type": "pubkey"
          },
          {
            "name": "buybackAuthority",
            "type": "pubkey"
          },
          {
            "name": "popMint",
            "docs": [
              "External $POP mint (launched outside this program). Settable once; buyback withdrawals",
              "are blocked until it is published."
            ],
            "type": "pubkey"
          },
          {
            "name": "launchesEnabled",
            "type": "bool"
          },
          {
            "name": "settings",
            "type": {
              "defined": {
                "name": "factorySettings"
              }
            }
          },
          {
            "name": "marketCount",
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
      "name": "protocolInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "scarFormed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "binId",
            "type": "i32"
          },
          {
            "name": "base",
            "type": "u64"
          },
          {
            "name": "quote",
            "type": "u64"
          },
          {
            "name": "binPairedQuoteLifetime",
            "type": "u64"
          },
          {
            "name": "marketPairedQuoteLifetime",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "swapArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "grossInput",
            "type": "u64"
          },
          {
            "name": "minOutput",
            "type": "u64"
          },
          {
            "name": "deadlineSlot",
            "type": "u64"
          },
          {
            "name": "expectedConfigVersion",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "swapExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "grossInput",
            "type": "u64"
          },
          {
            "name": "output",
            "type": "u64"
          },
          {
            "name": "scarFee",
            "type": "u64"
          },
          {
            "name": "protocolFee",
            "type": "u64"
          },
          {
            "name": "creatorFee",
            "type": "u64"
          },
          {
            "name": "binsInspected",
            "type": "u8"
          },
          {
            "name": "startBin",
            "type": "i32"
          },
          {
            "name": "endBin",
            "type": "i32"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
