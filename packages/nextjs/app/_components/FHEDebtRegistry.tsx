"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@civic/auth-web3/react";
import {
	buildParamsFromAbi,
	getEncryptionMethod,
	useFHEDecrypt,
	useFHEEncryption,
	useFhevm,
	useInMemoryStorage,
} from "@se-2/fhevm-sdk";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/helper";
import { useWagmiEthers } from "~~/hooks/wagmi/useWagmiEthers";
import type { AllowedChainIds } from "~~/utils/scaffold-eth/networks";


type DebtView = {
	debtor: string;
	creditor: string;
	dueDate: bigint;
	closed: boolean;
};

const initialMockChains = {
	31337: "http://localhost:8545",
	11155111: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org",
} as const;

export const FHEDebtRegistry = () => {
	const { isConnected, chain } = useAccount();
	const { user } = useUser();

	const provider = useMemo(() => {
		if (typeof window === "undefined") return undefined;
		return (window as any).ethereum;
	}, []);

	const chainId = chain?.id;

	const {
		instance: fhevmInstance,
		status: fhevmStatus,
		error: fhevmError,
	} = useFhevm({
		provider,
		chainId,
		initialMockChains,
		enabled: true,
	});

	const {
		chainId: wagmiChainId,
		ethersReadonlyProvider,
		ethersSigner,
	} = useWagmiEthers(initialMockChains);

	const allowedChainId = typeof wagmiChainId === "number" ? (wagmiChainId as AllowedChainIds) : undefined;
	const { data: debtRegistry } = useDeployedContractInfo({ contractName: "DebtRegistry", chainId: allowedChainId });

	const [statusMessage, setStatusMessage] = useState<string>("");
	const [lastTxHash, setLastTxHash] = useState<string | undefined>(undefined);

	const [createRef, setCreateRef] = useState<string>("");
	const [createCreditor, setCreateCreditor] = useState<string>("");
	const [createAmount, setCreateAmount] = useState<string>("");
	const [createDueDate, setCreateDueDate] = useState<string>(() => {
		const defaultTs = Math.floor(Date.now() / 1000) + 86400;
		return String(defaultTs);
	});

	const [lookupRef, setLookupRef] = useState<string>("");
	const [paymentAmount, setPaymentAmount] = useState<string>("");

	const [activeDebtId, setActiveDebtId] = useState<`0x${string}` | undefined>(undefined);
	const [debtView, setDebtView] = useState<DebtView | undefined>(undefined);
	const [isFetchingDebt, setIsFetchingDebt] = useState<boolean>(false);
	const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);
	const [outstandingHandle, setOutstandingHandle] = useState<`0x${string}` | undefined>(undefined);

	const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();

	const decryptRequests = useMemo(() => {
		if (!debtRegistry?.address || !outstandingHandle) return undefined;
		if (outstandingHandle === ethers.ZeroHash) return undefined;
		return [
			{
				handle: outstandingHandle,
				contractAddress: debtRegistry.address as `0x${string}`,
			},
		] as const;
	}, [debtRegistry?.address, outstandingHandle]);

	const {
		canDecrypt,
		decrypt,
		isDecrypting,
		message: decryptMessage,
		results: decryptResults,
	} = useFHEDecrypt({
		instance: fhevmInstance,
		ethersSigner: ethersSigner as any,
		fhevmDecryptionSignatureStorage,
		chainId: wagmiChainId,
		requests: decryptRequests,
	});

	useEffect(() => {
		if (decryptMessage) setStatusMessage(decryptMessage);
	}, [decryptMessage]);

	const decryptedOutstanding = useMemo(() => {
		if (!outstandingHandle) return undefined;
		const clear = decryptResults[outstandingHandle];
		return typeof clear === "undefined" ? undefined : clear;
	}, [decryptResults, outstandingHandle]);

	const { encryptWith } = useFHEEncryption({
		instance: fhevmInstance,
		ethersSigner: ethersSigner as any,
		contractAddress: debtRegistry?.address as `0x${string}` | undefined,
	});

	const computeDebtId = useCallback((input: string): `0x${string}` | undefined => {
		const trimmed = input.trim();
		if (!trimmed) return undefined;
		if (ethers.isHexString(trimmed)) {
			try {
				const normalized = ethers.zeroPadValue(trimmed, 32);
				return normalized as `0x${string}`;
			} catch (err) {
				console.error("Failed to normalize hex debt id", err);
				return undefined;
			}
		}
		return ethers.id(trimmed) as `0x${string}`;
	}, []);

	const createDebtId = useMemo(() => computeDebtId(createRef), [computeDebtId, createRef]);
	const lookupDebtId = useMemo(() => computeDebtId(lookupRef), [computeDebtId, lookupRef]);

	const getEncryptionMethodFor = useCallback(
		(fnName: "createDebt" | "pay") => {
			if (!debtRegistry?.abi) return { method: undefined as string | undefined, error: "Contract ABI unavailable" } as const;
			const fnAbi = (debtRegistry.abi as unknown as any[]).find(item => item?.type === "function" && item?.name === fnName);
			if (!fnAbi) return { method: undefined as string | undefined, error: `Function ${fnName} not found in ABI` } as const;
			const encryptedInput = fnAbi.inputs?.find((input: any) => String(input?.internalType || "").includes("externalEuint"));
			if (!encryptedInput)
				return { method: undefined as string | undefined, error: `Encrypted input not found for ${fnName}` } as const;
			return { method: getEncryptionMethod(encryptedInput.internalType), error: undefined } as const;
		},
		[debtRegistry?.abi],
	);

	const refreshDebt = useCallback(
		async (id: `0x${string}`) => {
			if (!debtRegistry?.address || !debtRegistry?.abi) {
				setStatusMessage("DebtRegistry contract not available on this network");
				return;
			}
			if (!ethersReadonlyProvider) {
				setStatusMessage("Readonly provider unavailable");
				return;
			}

			setIsFetchingDebt(true);
			try {
				const contract = new ethers.Contract(
					debtRegistry.address as `0x${string}`,
					debtRegistry.abi as any,
					ethersReadonlyProvider,
				);

				const debt = (await contract.getDebt(id)) as unknown as [string, string, bigint, boolean];
				const encAmount = (await contract.getEncryptedDebtAmount(id)) as `0x${string}`;

				setDebtView({
					debtor: debt[0],
					creditor: debt[1],
					dueDate: debt[2],
					closed: debt[3],
				});
				setOutstandingHandle(encAmount);
				setActiveDebtId(id);
				setStatusMessage("Debt details refreshed");
			} catch (err) {
				console.error(err);
				setStatusMessage(`Fetching debt failed: ${err instanceof Error ? err.message : String(err)}`);
				setDebtView(undefined);
				setOutstandingHandle(undefined);
			} finally {
				setIsFetchingDebt(false);
			}
		},
		[debtRegistry?.address, debtRegistry?.abi, ethersReadonlyProvider],
	);

	const handleCreateDebt = useCallback(async () => {
		if (!fhevmInstance) return setStatusMessage("FHEVM instance not ready");
		if (!debtRegistry?.address || !debtRegistry?.abi) return setStatusMessage("DebtRegistry contract unavailable");
		if (!ethersSigner) return setStatusMessage("Wallet signer not ready");
		if (!createDebtId) return setStatusMessage("Invalid debt identifier");
		if (!ethers.isAddress(createCreditor)) return setStatusMessage("Invalid creditor address");

		let amount: bigint;
		try {
			amount = BigInt(createAmount);
		} catch {
			return setStatusMessage("Amount must be an integer value");
		}
		if (amount <= 0n) return setStatusMessage("Amount must be greater than zero");

		let dueDate: bigint;
		try {
			dueDate = BigInt(Math.floor(Number(createDueDate)));
		} catch {
			return setStatusMessage("Due date must be a unix timestamp");
		}
		if (dueDate <= 0n) return setStatusMessage("Due date must be positive");

		const { method, error } = getEncryptionMethodFor("createDebt");
		if (!method) return setStatusMessage(error ?? "Unable to resolve encryption method");

		setIsSubmittingTx(true);
		setLastTxHash(undefined);
		setStatusMessage("Encrypting principal...");

		try {
			const enc = await encryptWith(builder => {
				(builder as any)[method](amount);
			});
			if (!enc) throw new Error("Encryption failed");

			const params = buildParamsFromAbi(enc, debtRegistry.abi as unknown as any[], "createDebt");
			const writeContract = new ethers.Contract(
				debtRegistry.address as `0x${string}`,
				debtRegistry.abi as any,
				ethersSigner,
			);

			setStatusMessage("Sending createDebt transaction...");
			const tx = await writeContract.createDebt(createDebtId, createCreditor, params[0], params[1], dueDate);
			setLastTxHash(tx.hash);
			setStatusMessage("Waiting for confirmation...");
			await tx.wait();
			setStatusMessage("Debt created successfully");

			setLookupRef(createRef);
			await refreshDebt(createDebtId);
		} catch (err) {
			console.error(err);
			setStatusMessage(`createDebt failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setIsSubmittingTx(false);
		}
	}, [
		createCreditor,
		createAmount,
		createDebtId,
		createDueDate,
		createRef,
		debtRegistry?.address,
		debtRegistry?.abi,
		encryptWith,
		ethersSigner,
		fhevmInstance,
		getEncryptionMethodFor,
		refreshDebt,
	]);

	const handlePayDebt = useCallback(async () => {
		if (!fhevmInstance) return setStatusMessage("FHEVM instance not ready");
		if (!debtRegistry?.address || !debtRegistry?.abi) return setStatusMessage("DebtRegistry contract unavailable");
		if (!ethersSigner) return setStatusMessage("Wallet signer not ready");
		if (!lookupDebtId) return setStatusMessage("Select a debt to pay");

		let amount: bigint;
		try {
			amount = BigInt(paymentAmount);
		} catch {
			return setStatusMessage("Payment must be an integer value");
		}
		if (amount <= 0n) return setStatusMessage("Payment must be greater than zero");

		const { method, error } = getEncryptionMethodFor("pay");
		if (!method) return setStatusMessage(error ?? "Unable to resolve encryption method");

		setIsSubmittingTx(true);
		setLastTxHash(undefined);
		setStatusMessage("Encrypting payment...");

		try {
			const enc = await encryptWith(builder => {
				(builder as any)[method](amount);
			});
			if (!enc) throw new Error("Encryption failed");

			const params = buildParamsFromAbi(enc, debtRegistry.abi as unknown as any[], "pay");
			const writeContract = new ethers.Contract(
				debtRegistry.address as `0x${string}`,
				debtRegistry.abi as any,
				ethersSigner,
			);

			setStatusMessage("Sending pay transaction...");
			const tx = await writeContract.pay(lookupDebtId, params[0], params[1]);
			setLastTxHash(tx.hash);
			setStatusMessage("Waiting for confirmation...");
			await tx.wait();
			setStatusMessage("Payment submitted");

			await refreshDebt(lookupDebtId);
		} catch (err) {
			console.error(err);
			setStatusMessage(`pay failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setIsSubmittingTx(false);
		}
	}, [
		debtRegistry?.address,
		debtRegistry?.abi,
		encryptWith,
		ethersSigner,
		fhevmInstance,
		getEncryptionMethodFor,
		lookupDebtId,
		paymentAmount,
		refreshDebt,
	]);

	const buttonClass =
		"inline-flex items-center justify-center px-6 py-3 font-semibold shadow-lg transition-all duration-200 hover:scale-105 " +
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 " +
		"disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed";

	const primaryButtonClass =
		buttonClass + " bg-[#FFD208] text-[#2D2D2D] hover:bg-[#A38025] focus-visible:ring-[#2D2D2D] cursor-pointer";
	const secondaryButtonClass =
		buttonClass + " bg-black text-[#F4F4F4] hover:bg-[#1F1F1F] focus-visible:ring-[#FFD208] cursor-pointer";

	const titleClass = "font-bold text-gray-900 text-xl mb-4 border-b border-gray-300 pb-2";
	const sectionClass = "bg-[#f4f4f4] shadow-lg p-6 mb-6 text-gray-900";

	if (!user) {
		return (
			<div className="max-w-6xl mx-auto p-6 text-gray-900">
				<div className="flex items-center justify-center">
					<div className="bg-white shadow-xl p-8 text-center">
						<div className="mb-4">
							<span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-900/30 text-amber-400 text-3xl">
								⚠️
							</span>
						</div>
						<h2 className="text-2xl font-extrabold text-gray-900 mb-2">Civic session required</h2>
						<p className="text-gray-700 mb-6">Sign in with Civic to use the FHE Debt Registry demo.</p>
					</div>
				</div>
			</div>
		);
	}

	if (!isConnected) {
		return (
			<div className="max-w-6xl mx-auto p-6 text-gray-900">
				<div className="flex items-center justify-center">
					<div className="bg-white shadow-xl p-8 text-center">
						<div className="mb-4">
							<span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-900/30 text-amber-400 text-3xl">
								⚠️
							</span>
						</div>
						<h2 className="text-2xl font-extrabold text-gray-900 mb-2">Wallet not connected</h2>
						<p className="text-gray-700 mb-6">Connect your wallet through Civic to interact with the Debt Registry.</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-6xl mx-auto p-6 space-y-6 text-gray-900">
			<div className="text-center mb-8 text-black">
				<h1 className="text-3xl font-bold mb-2">FHE Debt Registry</h1>
				<p className="text-gray-600">Create debts, submit confidential repayments, and decrypt outstanding balance.</p>
			</div>

			<div className={sectionClass}>
				<h3 className={titleClass}>🆕 Create Debt</h3>
				<div className="grid gap-4 md:grid-cols-2">
					<Field label="Debt Reference" value={createRef} onChange={setCreateRef} placeholder="invoice-123" />
					<Field label="Creditor Address" value={createCreditor} onChange={setCreateCreditor} placeholder="0x..." />
					<Field label="Amount (integer)" value={createAmount} onChange={setCreateAmount} placeholder="1000" />
					<Field label="Due Date (unix seconds)" value={createDueDate} onChange={setCreateDueDate} />
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-4">
					<button
						className={primaryButtonClass}
						onClick={handleCreateDebt}
						disabled={isSubmittingTx || !fhevmInstance || !debtRegistry?.address}
					>
						{isSubmittingTx ? "⏳ Processing..." : "📄 Create Debt"}
					</button>
					<span className="text-sm text-gray-700 break-all">
						Derived Debt ID: {createDebtId ?? "(invalid reference)"}
					</span>
				</div>
			</div>

			<div className={sectionClass}>
				<h3 className={titleClass}>🔍 Manage Debt</h3>
				<div className="grid gap-4 md:grid-cols-2">
					<Field label="Debt Reference" value={lookupRef} onChange={setLookupRef} placeholder="invoice-123" />
					<Field label="Payment Amount" value={paymentAmount} onChange={setPaymentAmount} placeholder="250" />
				</div>
				<div className="mt-4 flex flex-wrap gap-4">
					<button className={secondaryButtonClass} onClick={() => lookupDebtId && refreshDebt(lookupDebtId)} disabled={!lookupDebtId || isFetchingDebt}>
						{isFetchingDebt ? "⏳ Fetching..." : "🔁 Fetch Debt"}
					</button>
					<button className={secondaryButtonClass} onClick={handlePayDebt} disabled={!lookupDebtId || isSubmittingTx}>
						{isSubmittingTx ? "⏳ Processing..." : "💸 Submit Payment"}
					</button>
					<button className={secondaryButtonClass} onClick={decrypt} disabled={!canDecrypt || isDecrypting}>
						{isDecrypting ? "⏳ Decrypting..." : "🔓 Decrypt Outstanding"}
					</button>
				</div>

				{debtView && (
					<div className="mt-6 border bg-white border-gray-200 p-4">
						<div className="grid gap-3">
							{printProperty("Debtor", debtView.debtor)}
							{printProperty("Creditor", debtView.creditor)}
							{printProperty("Due Date", `${debtView.dueDate} (${new Date(Number(debtView.dueDate) * 1000).toLocaleString()})`)}
							{printBooleanProperty("Closed", debtView.closed)}
							{printProperty("Encrypted Amount", outstandingHandle ?? "-")}
							{printProperty(
								"Decrypted Outstanding",
								typeof decryptedOutstanding !== "undefined" ? decryptedOutstanding.toString() : "Not decrypted",
							)}
							{printProperty("Active Debt ID", activeDebtId ?? "-")}
						</div>
					</div>
				)}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div className={sectionClass}>
					<h3 className={titleClass}>📡 FHEVM Status</h3>
					<div className="space-y-3">
						{printProperty("Instance", fhevmInstance ? "Connected" : "Not ready")}
						{printProperty("Status", fhevmStatus)}
						{printProperty("Error", fhevmError ?? "-")}
					</div>
				</div>

				<div className={sectionClass}>
					<h3 className={titleClass}>🧾 Activity</h3>
					<div className="space-y-3">
						{printProperty("Status Message", statusMessage || "-")}
						{printProperty("Last TX", lastTxHash ?? "-")}
						{printProperty("Can Decrypt", canDecrypt)}
					</div>
				</div>
			</div>
		</div>
	);
};

type FieldProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
};

const Field = ({ label, value, onChange, placeholder }: FieldProps) => {
	return (
		<label className="flex flex-col space-y-2 text-gray-900">
			<span className="text-sm font-semibold">{label}</span>
			<input
				className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD208] text-black"
				value={value}
				onChange={event => onChange(event.target.value)}
				placeholder={placeholder}
			/>
		</label>
	);
};

function printProperty(name: string, value: unknown) {
	let displayValue: string;

	if (typeof value === "boolean") {
		return printBooleanProperty(name, value);
	} else if (typeof value === "string" || typeof value === "number") {
		displayValue = String(value);
	} else if (typeof value === "bigint") {
		displayValue = value.toString();
	} else if (value === null) {
		displayValue = "null";
	} else if (value === undefined) {
		displayValue = "undefined";
	} else if (value instanceof Error) {
		displayValue = value.message;
	} else {
		displayValue = JSON.stringify(value);
	}

	return (
		<div className="flex justify-between items-center py-2 px-3 bg-white border border-gray-200 w-full">
			<span className="text-gray-800 font-medium">{name}</span>
			<span className="ml-2 font-mono text-sm font-semibold text-gray-900 bg-gray-100 px-2 py-1 border border-gray-300">
				{displayValue}
			</span>
		</div>
	);
}

function printBooleanProperty(name: string, value: boolean) {
	return (
		<div className="flex justify-between items-center py-2 px-3 bg-white border border-gray-200 w-full">
			<span className="text-gray-700 font-medium">{name}</span>
			<span
				className={`font-mono text-sm font-semibold px-2 py-1 border ${
					value ? "text-green-800 bg-green-100 border-green-300" : "text-red-800 bg-red-100 border-red-300"
				}`}
			>
				{value ? "✓ true" : "✗ false"}
			</span>
		</div>
	);
}

