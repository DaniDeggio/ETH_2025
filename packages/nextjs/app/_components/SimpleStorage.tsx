"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@civic/auth-web3/react";
import { ethers } from "ethers";
import type { InterfaceAbi } from "ethers";
import { useAccount, usePublicClient } from "wagmi";
import type { Abi } from "viem";
import { useDeployedContractInfo } from "~~/hooks/helper";
import { useWagmiEthers } from "~~/hooks/wagmi/useWagmiEthers";
import type { AllowedChainIds } from "~~/utils/scaffold-eth/networks";

const initialMockChains = {
	31337: "http://localhost:8545",
	11155111: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org",
} as const;

export const SimpleStorage = () => {
	const { user } = useUser();
	const { isConnected } = useAccount();

	const {
		chainId: wagmiChainId,
		ethersReadonlyProvider,
		ethersSigner,
		walletClient,
	} = useWagmiEthers(initialMockChains);

	const allowedChainId = typeof wagmiChainId === "number" ? (wagmiChainId as AllowedChainIds) : undefined;
	const { data: simpleStorageInfo, isLoading: isContractLoading } = useDeployedContractInfo({
		contractName: "SimpleStorage",
		chainId: allowedChainId,
	});
	const publicClient = usePublicClient({ chainId: allowedChainId });

	const [currentValue, setCurrentValue] = useState<string>("-");
	const [inputValue, setInputValue] = useState<string>("");
	const [statusMessage, setStatusMessage] = useState<string>("");
	const [lastTxHash, setLastTxHash] = useState<string | undefined>(undefined);
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

	const contractAddress = simpleStorageInfo?.address as `0x${string}` | undefined;
	const contractAbi = useMemo(() => simpleStorageInfo?.abi as unknown as InterfaceAbi | undefined, [
		simpleStorageInfo?.abi,
	]);
	const viemAbi = useMemo(() => simpleStorageInfo?.abi as unknown as Abi | undefined, [simpleStorageInfo?.abi]);

	const isContractReady = useMemo(() => {
		return Boolean(contractAddress && contractAbi && ethersReadonlyProvider);
	}, [contractAddress, contractAbi, ethersReadonlyProvider]);

	const refreshValue = useCallback(async () => {
		if (!isContractReady || !contractAddress || !contractAbi || !ethersReadonlyProvider) {
			setStatusMessage("SimpleStorage contract unavailable on this network");
			return;
		}

		setIsRefreshing(true);
		setStatusMessage("Fetching stored value...");
		try {
			const contract = new ethers.Contract(contractAddress, contractAbi, ethersReadonlyProvider);
			const value = (await contract.retrieve()) as bigint | number;
			setCurrentValue(String(value));
			setStatusMessage("Stored value fetched");
		} catch (err) {
			console.error(err);
			setStatusMessage(`Read failed: ${err instanceof Error ? err.message : String(err)}`);
			setCurrentValue("-");
		} finally {
			setIsRefreshing(false);
		}
	}, [contractAbi, contractAddress, ethersReadonlyProvider, isContractReady]);

	useEffect(() => {
		if (isContractReady) {
			void refreshValue();
		}
	}, [isContractReady, refreshValue]);

	const handleStore = useCallback(async () => {
		if (!isContractReady || !contractAddress || !contractAbi || !viemAbi) {
			setStatusMessage("SimpleStorage contract unavailable or wallet not ready");
			return;
		}

		const signer = ethersSigner;
		const civicWallet = walletClient;
		const desiredChainId = allowedChainId;
		if (!signer && !civicWallet) {
			setStatusMessage("Wallet not ready — try reconnecting with Civic");
			return;
		}

		let parsedValue: bigint;
		try {
			parsedValue = BigInt(inputValue.trim());
		} catch (err) {
			setStatusMessage("Enter a valid integer value");
			return;
		}

		setIsSubmitting(true);
		setLastTxHash(undefined);
		setStatusMessage("Sending transaction...");
		try {
			let txHash: `0x${string}` | undefined;
			if (civicWallet?.account) {
				let activeChain = civicWallet.chain;
				if (desiredChainId && civicWallet.chain?.id !== desiredChainId) {
					try {
						activeChain = await civicWallet.switchChain({ id: desiredChainId });
					} catch (switchErr) {
						console.error("Chain switch rejected", switchErr);
						setStatusMessage("Switch Civic wallet to Sepolia to continue");
						return;
					}
				}
				const chainOverrides = activeChain ? { chain: activeChain } : {};
				let gasLimit: bigint | undefined;
				if (publicClient) {
					try {
						const estimated = await publicClient.estimateContractGas({
							account: civicWallet.account,
							address: contractAddress,
							abi: viemAbi,
							functionName: "store",
							args: [parsedValue],
							...chainOverrides,
						});
						gasLimit = estimated + estimated / 5n + 10_000n;
					} catch (gasErr) {
						console.warn("Gas estimation failed, falling back to wallet defaults", gasErr);
					}
				}
				txHash = await civicWallet.writeContract({
					account: civicWallet.account,
					address: contractAddress,
					abi: viemAbi,
					functionName: "store",
					args: [parsedValue],
					...chainOverrides,
					...(gasLimit ? { gas: gasLimit } : {}),
				});
				setLastTxHash(txHash);
				setStatusMessage("Waiting for confirmation...");
				if (publicClient) {
					await publicClient.waitForTransactionReceipt({ hash: txHash });
				} else if (ethersReadonlyProvider) {
					await ethersReadonlyProvider.waitForTransaction(txHash);
				}
			} else if (signer) {
				if (desiredChainId) {
					const signerNetwork = await signer.provider?.getNetwork();
					if (signerNetwork && signerNetwork.chainId !== BigInt(desiredChainId)) {
						try {
							await signer.provider?.send("wallet_switchEthereumChain", [{ chainId: `0x${desiredChainId.toString(16)}` }]);
						} catch (switchErr) {
							console.error("Signer chain switch rejected", switchErr);
							setStatusMessage("Switch wallet to Sepolia to continue");
							return;
						}
					}
				}
				const contract = new ethers.Contract(contractAddress, contractAbi, signer);
				let gasLimit: bigint | undefined;
				try {
					const estimated = await contract.store.estimateGas(parsedValue);
					gasLimit = estimated + estimated / 5n + 10_000n;
				} catch (gasErr) {
					console.warn("Gas estimation failed, falling back to wallet defaults", gasErr);
				}
				const overrides = gasLimit ? { gasLimit } : {};
				const tx = await contract.store(parsedValue, overrides);
				setLastTxHash(tx.hash);
				setStatusMessage("Waiting for confirmation...");
				await tx.wait();
			}
			setStatusMessage("Value stored successfully");
			setInputValue("");
			await refreshValue();
		} catch (err) {
			console.error(err);
			setStatusMessage(`Write failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setIsSubmitting(false);
		}
	}, [allowedChainId, contractAbi, contractAddress, ethersReadonlyProvider, ethersSigner, inputValue, isContractReady, publicClient, refreshValue, viemAbi, walletClient]);

	const buttonBase =
		"inline-flex items-center justify-center px-5 py-3 font-semibold shadow transition-all duration-200 " +
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
		"disabled:opacity-50 disabled:cursor-not-allowed";
	const primaryButton = buttonBase + " bg-[#FFD208] text-[#1f1f1f] hover:bg-[#A38025] focus-visible:ring-[#1f1f1f]";
	const secondaryButton = buttonBase + " bg-[#1f1f1f] text-white hover:bg-[#111] focus-visible:ring-[#FFD208]";

	if (!user) {
		return (
			<div className="max-w-3xl mx-auto p-6 text-gray-900">
				<div className="flex items-center justify-center">
					<div className="bg-white shadow-xl p-8 text-center">
						<div className="mb-4">
							<span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-900/30 text-amber-400 text-3xl">
								⚠️
							</span>
						</div>
						<h2 className="text-2xl font-extrabold text-gray-900 mb-2">Civic session required</h2>
						<p className="text-gray-700">Sign in with Civic to try the SimpleStorage demo.</p>
					</div>
				</div>
			</div>
		);
	}

	if (!isConnected) {
		return (
			<div className="max-w-3xl mx-auto p-6 text-gray-900">
				<div className="flex items-center justify-center">
					<div className="bg-white shadow-xl p-8 text-center">
						<div className="mb-4">
							<span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-900/30 text-amber-400 text-3xl">
								⚠️
							</span>
						</div>
						<h2 className="text-2xl font-extrabold text-gray-900 mb-2">Wallet not connected</h2>
						<p className="text-gray-700">Connect your wallet through Civic to interact with SimpleStorage.</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-3xl mx-auto p-6 space-y-6 text-gray-900">
			<div className="text-center text-black">
				<h1 className="text-3xl font-bold mb-2">SimpleStorage Demo</h1>
				<p className="text-gray-600">Read and write a uint256 value on the SimpleStorage contract.</p>
			</div>

			<div className="bg-[#f4f4f4] shadow-lg p-6 space-y-4">
				<div className="flex items-center justify-between">
					<span className="text-lg font-semibold text-gray-900">Current value</span>
					<button className={secondaryButton} onClick={() => void refreshValue()} disabled={isRefreshing || !isContractReady}>
						{isRefreshing ? "⏳ Refreshing..." : "🔄 Refresh"}
					</button>
				</div>
				<div className="font-mono text-xl bg-white border border-gray-200 rounded px-4 py-3 text-gray-900">
					{isContractLoading ? "Loading..." : currentValue}
				</div>
			</div>

			<div className="bg-[#f4f4f4] shadow-lg p-6 space-y-4">
				<label className="flex flex-col space-y-2 text-gray-900">
					<span className="text-sm font-semibold">New value</span>
					<input
						className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD208] text-black"
						value={inputValue}
						onChange={event => setInputValue(event.target.value)}
						placeholder="Enter an integer"
					/>
				</label>
				<button className={primaryButton} onClick={() => void handleStore()} disabled={isSubmitting || !inputValue.trim() || !isContractReady}>
					{isSubmitting ? "⏳ Storing..." : "💾 Store value"}
				</button>
			</div>

			<div className="bg-[#f4f4f4] shadow-lg p-6 space-y-3 text-sm">
				<div className="flex justify-between">
					<span className="font-semibold text-gray-800">Status</span>
					<span className="text-gray-700 max-w-[65%] text-right break-words">{statusMessage || "Ready"}</span>
				</div>
				<div className="flex justify-between">
					<span className="font-semibold text-gray-800">Last tx</span>
					<span className="text-gray-700 max-w-[65%] text-right break-words">{lastTxHash ?? "-"}</span>
				</div>
		</div>
	</div>
	);
};

