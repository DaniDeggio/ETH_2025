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
import { Address } from "~~/components/scaffold-eth";


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

const toDateInputValue = (date: Date) => {
	const iso = date.toISOString();
	return iso.slice(0, 10);
};

const getDefaultDueDate = () => {
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	return toDateInputValue(tomorrow);
};

export const FHEDebtRegistry = () => {
	const { isConnected, chain, address } = useAccount();
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
	const { data: confidentialToken } = useDeployedContractInfo({ contractName: "ConfidentialTokenExample", chainId: allowedChainId });

	const [statusMessage, setStatusMessage] = useState<string>("");
	const [lastTxHash, setLastTxHash] = useState<string | undefined>(undefined);

	const [createRef, setCreateRef] = useState<string>("");
	const [createCreditor, setCreateCreditor] = useState<string>("");
	const [createAmount, setCreateAmount] = useState<string>("");
	const [createDueDate, setCreateDueDate] = useState<string>(() => getDefaultDueDate());

	const [lookupRef, setLookupRef] = useState<string>("");
	const [paymentAmount, setPaymentAmount] = useState<string>("");

	const [activeDebtId, setActiveDebtId] = useState<`0x${string}` | undefined>(undefined);
	const [debtView, setDebtView] = useState<DebtView | undefined>(undefined);
	const [isFetchingDebt, setIsFetchingDebt] = useState<boolean>(false);
	const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);
	const [outstandingHandle, setOutstandingHandle] = useState<`0x${string}` | undefined>(undefined);
	const [walletBalanceHandle, setWalletBalanceHandle] = useState<`0x${string}` | undefined>(undefined);
	const [isFetchingBalance, setIsFetchingBalance] = useState<boolean>(false);

	const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();

	const decryptRequests = useMemo(() => {
		const requests: Array<{ handle: `0x${string}`; contractAddress: `0x${string}` }> = [];

		if (debtRegistry?.address && outstandingHandle && outstandingHandle !== ethers.ZeroHash) {
			requests.push({
				handle: outstandingHandle,
				contractAddress: debtRegistry.address as `0x${string}`,
			});
		}

		if (confidentialToken?.address && walletBalanceHandle && walletBalanceHandle !== ethers.ZeroHash) {
			requests.push({
				handle: walletBalanceHandle,
				contractAddress: confidentialToken.address as `0x${string}`,
			});
		}

		return requests.length ? (requests as any) : undefined;
	}, [confidentialToken?.address, debtRegistry?.address, outstandingHandle, walletBalanceHandle]);

	const {
		canDecrypt,
		decrypt,
		isDecrypting,
		message: decryptMessage,
		results: decryptResults,
		error: decryptError,
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

	useEffect(() => {
		if (decryptError) {
			console.error("decrypt error", decryptError);
			setStatusMessage(decryptError);
		}
	}, [decryptError]);

	const decryptedOutstanding = useMemo(() => {
		if (!outstandingHandle) return undefined;
		const clear = decryptResults[outstandingHandle];
		return typeof clear === "undefined" ? undefined : clear;
	}, [decryptResults, outstandingHandle]);

	const decryptedWalletBalance = useMemo(() => {
		if (!walletBalanceHandle) return undefined;
		const clear = decryptResults[walletBalanceHandle];
		return typeof clear === "undefined" ? undefined : clear;
	}, [decryptResults, walletBalanceHandle]);

	const walletBalanceDisplay = useMemo(() => {
		if (!walletBalanceHandle) return "—";
		if (walletBalanceHandle === ethers.ZeroHash) return "0";
		if (typeof decryptedWalletBalance !== "undefined") return decryptedWalletBalance.toString();
		return "🔐";
	}, [decryptedWalletBalance, walletBalanceHandle]);

	const showBalanceDecryptHint = useMemo(() => {
		return (
			!!walletBalanceHandle &&
			walletBalanceHandle !== ethers.ZeroHash &&
			typeof decryptedWalletBalance === "undefined"
		);
	}, [decryptedWalletBalance, walletBalanceHandle]);

	const walletBalanceHandleDisplay = useMemo(() => {
		if (!walletBalanceHandle) return "N/A";
		if (walletBalanceHandle.length <= 18) return walletBalanceHandle;
		return `${walletBalanceHandle.slice(0, 10)}…${walletBalanceHandle.slice(-6)}`;
	}, [walletBalanceHandle]);

		const refreshWalletBalance = useCallback(async () => {
			if (!address) {
				setWalletBalanceHandle(undefined);
				return;
			}
			if (!confidentialToken?.address || !confidentialToken?.abi || !ethersReadonlyProvider) return;

			setIsFetchingBalance(true);
			try {
				const tokenContract = new ethers.Contract(
					confidentialToken.address as `0x${string}`,
					confidentialToken.abi as any,
					ethersReadonlyProvider,
				);
				const handle = (await tokenContract.confidentialBalanceOf(address)) as `0x${string}`;
				setWalletBalanceHandle(handle);
			} catch (err) {
				console.error(err);
				setStatusMessage(`Errore aggiornando saldo: ${err instanceof Error ? err.message : String(err)}`);
			} finally {
				setIsFetchingBalance(false);
			}
		}, [address, confidentialToken?.abi, confidentialToken?.address, ethersReadonlyProvider]);

		useEffect(() => {
			refreshWalletBalance();
		}, [refreshWalletBalance]);

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

		if (!createDueDate) return setStatusMessage("Seleziona una data di scadenza valida");

		const parsedDueDate = Date.parse(`${createDueDate}T23:59:59Z`);
		if (Number.isNaN(parsedDueDate)) return setStatusMessage("Data di scadenza non valida");
		const dueDate = BigInt(Math.floor(parsedDueDate / 1000));

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
			await refreshWalletBalance();
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
		refreshWalletBalance,
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
			await refreshWalletBalance();
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
		refreshWalletBalance,
	]);

	const buttonClass =
		"relative inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold transition-all duration-200 " +
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent " +
		"disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed";

	const primaryButtonClass =
		buttonClass +
		" bg-gradient-to-r from-[#FFE864] via-[#FF9A64] to-[#FE6684] text-[#2A1A1A] shadow-[0_12px_24px_-12px_rgba(255,152,100,0.8)] " +
		"hover:scale-[1.03] focus-visible:ring-[#ff8a65]";
	const secondaryButtonClass =
		buttonClass +
		" bg-white/70 text-[#1F1F1F] shadow-[0_8px_20px_-10px_rgba(34,34,34,0.35)] backdrop-blur-md border border-white/40 " +
		"hover:bg-white/90 focus-visible:ring-[#94a3b8]";
	const subtleButtonClass =
		"inline-flex items-center justify-center rounded-lg border border-white/40 bg-white/80 px-3 py-1 text-xs font-semibold text-gray-700 " +
		"shadow-[0_4px_12px_-6px_rgba(15,23,42,0.45)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8]";

	const titleClass = "flex items-center gap-3 text-gray-900 text-xl font-bold mb-6";
	const sectionClass =
		"rounded-2xl border border-white/40 bg-white/65 backdrop-blur-2xl p-8 text-gray-900 shadow-[0_30px_60px_-35px_rgba(30,64,175,0.45)]";
	const todayIso = useMemo(() => toDateInputValue(new Date()), []);

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
		<div className="relative mx-auto flex min-h-[80vh] w-full max-w-6xl flex-col gap-8 px-6 py-10 text-gray-900">
			<div className="absolute inset-0 -z-10 overflow-hidden rounded-[36px] bg-gradient-to-br from-[#10172B] via-[#1B1F3B] to-[#441752] shadow-[0_40px_120px_-40px_rgba(17,24,39,0.8)]" />
			<div className="absolute inset-0 -z-10 rounded-[36px] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_45%),_radial-gradient(circle_at_bottom,_rgba(255,174,94,0.18),_transparent_55%)]" />
			<header className="relative rounded-3xl border border-white/30 bg-white/15 p-10 text-white shadow-[0_25px_60px_-20px_rgba(255,255,255,0.35)] backdrop-blur-2xl">
				<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<div className="space-y-3">
						<span className="inline-flex items-center rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
							dApp Civic Ready
						</span>
						<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">FHE Debt Registry</h1>
						<p className="max-w-2xl text-base text-white/70">
							Gestisci debiti e rimborsi con trasparenza verificabile e privacy cifrata end-to-end. Tutte le azioni passano dal tuo wallet Civic, con importi trattati dal contratto solo in forma omomorfica.
						</p>
					</div>
					<div className="rounded-2xl border border-white/25 bg-white/10 px-6 py-4 text-sm">
						<div className="text-white/60">Wallet connesso</div>
						<div className="mt-3 rounded-xl border border-white/20 bg-black/30 p-3">
							<Address address={isConnected ? address : undefined} />
						</div>
						<p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/50">Sessione Civic obbligatoria</p>
					</div>
				</div>
			</header>

			<section className="relative grid gap-8 lg:grid-cols-[1.2fr,1fr]">
				<div className={sectionClass}>
					<h3 className={titleClass}>
						<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFE864] to-[#FF8A65] text-2xl shadow-[0_12px_30px_-16px_rgba(255,153,102,0.8)]">
							📄
						</span>
						<span>Nuovo debito</span>
					</h3>
					<p className="mb-6 text-sm text-gray-600">
						Definisci un nuovo rapporto di debito specificando controparti, importo e scadenza. L&apos;importo viene cifrato lato client prima di raggiungere il contratto.
					</p>
					<div className="mb-6 rounded-2xl border border-white/45 bg-white/75 p-5 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.45)]">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Saldo ConfidentialToken</p>
								<div className="mt-2 text-3xl font-extrabold text-gray-900">{walletBalanceDisplay}</div>
								<p className="mt-2 text-xs text-gray-500">
									Il saldo è custodito cifrato sul contratto. Puoi aggiornarlo e decifrarlo in ogni momento dal wallet Civic.
								</p>
							</div>
							<span className="inline-flex items-center rounded-lg border border-white/40 bg-white/80 px-3 py-1 font-mono text-[11px] font-semibold text-gray-600">
								{walletBalanceHandleDisplay}
							</span>
						</div>
						<div className="mt-4 flex flex-wrap items-center gap-3">
							<button
								className={`${subtleButtonClass} px-4 py-2 text-sm`}
								onClick={refreshWalletBalance}
								disabled={isFetchingBalance || !confidentialToken?.address}
							>
								{isFetchingBalance ? "⏳ Aggiornamento..." : "Aggiorna saldo"}
							</button>
							<button
								className={`${subtleButtonClass} px-4 py-2 text-sm`}
								onClick={decrypt}
								disabled={
									!canDecrypt ||
									isDecrypting ||
									!walletBalanceHandle ||
									walletBalanceHandle === ethers.ZeroHash
								}
							>
								{isDecrypting ? "⏳ Decifrando..." : "Decifra importi"}
							</button>
							{showBalanceDecryptHint && (
								<span className="text-xs font-semibold text-amber-600">
									🔐 Approva la firma in Civic per leggere il valore chiaro.
								</span>
							)}
						</div>
					</div>
					<div className="grid gap-5 md:grid-cols-2">
						<Field label="Debt Reference" value={createRef} onChange={setCreateRef} placeholder="invoice-123" />
						<Field label="Creditor Address" value={createCreditor} onChange={setCreateCreditor} placeholder="0x..." />
						<Field label="Amount (integer)" value={createAmount} onChange={setCreateAmount} placeholder="1000" inputMode="numeric" />
						<Field label="Due Date" value={createDueDate} onChange={setCreateDueDate} type="date" min={todayIso} />
					</div>
					<div className="mt-6 flex flex-wrap items-center gap-4">
						<button
							className={primaryButtonClass}
							onClick={handleCreateDebt}
							disabled={isSubmittingTx || !fhevmInstance || !debtRegistry?.address}
						>
							{isSubmittingTx ? "⏳ Processing..." : "Crea nuovo debito"}
						</button>
						<span className="rounded-full bg-black/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
							Debt ID {createDebtId ?? "pending"}
						</span>
					</div>
				</div>

				<div className={sectionClass}>
					<h3 className={titleClass}>
						<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7DD3FC] to-[#6366F1] text-2xl text-white shadow-[0_12px_30px_-16px_rgba(99,102,241,0.7)]">
							🔒
						</span>
						<span>Panoramica FHE</span>
					</h3>
					<div className="space-y-4 text-sm text-gray-600">
						{printProperty("Instance", fhevmInstance ? "Connected" : "Not ready")}
						{printProperty("Status", fhevmStatus)}
						{printProperty("Error", fhevmError ?? "-")}
						{printProperty("Can Decrypt", canDecrypt)}
					</div>
					<div className="mt-6 rounded-2xl border border-white/40 bg-white/45 p-4 text-xs text-gray-500 shadow-inner">
						Le richieste di cifratura e decifratura vengono firmate con la chiave Civic attiva. Assicurati di approvare le richieste nel wallet.
					</div>
				</div>
			</section>

			<section className="relative grid gap-8 lg:grid-cols-[1fr,1fr]">
				<div className={sectionClass}>
					<h3 className={titleClass}>
						<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#34D399] to-[#10B981] text-2xl text-white shadow-[0_12px_30px_-16px_rgba(16,185,129,0.6)]">
							💸
						</span>
						<span>Gestisci debito</span>
					</h3>
					<p className="mb-6 text-sm text-gray-600">
						Ricerca un debito esistente, invia un rimborso confidenziale e richiedi la decifratura del saldo residuo.
					</p>
					<div className="grid gap-5 md:grid-cols-2">
						<Field label="Debt Reference" value={lookupRef} onChange={setLookupRef} placeholder="invoice-123" />
						<Field label="Payment Amount" value={paymentAmount} onChange={setPaymentAmount} placeholder="250" inputMode="numeric" />
					</div>
					<div className="mt-6 flex flex-wrap gap-4">
						<button className={secondaryButtonClass} onClick={() => lookupDebtId && refreshDebt(lookupDebtId)} disabled={!lookupDebtId || isFetchingDebt}>
							{isFetchingDebt ? "⏳ Fetching..." : "Aggiorna stato"}
						</button>
						<button className={secondaryButtonClass} onClick={handlePayDebt} disabled={!lookupDebtId || isSubmittingTx}>
							{isSubmittingTx ? "⏳ Processing..." : "Invia rimborso"}
						</button>
						<button className={secondaryButtonClass} onClick={decrypt} disabled={!canDecrypt || isDecrypting}>
							{isDecrypting ? "⏳ Decrypting..." : "Decifra importi"}
						</button>
					</div>

					{debtView && (
						<div className="mt-8 rounded-2xl border border-white/40 bg-white/55 p-6 shadow-inner">
							<h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-gray-500">Dettagli correnti</h4>
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

				<div className={sectionClass}>
					<h3 className={titleClass}>
						<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FCA5A5] to-[#F97316] text-2xl text-white shadow-[0_12px_30px_-16px_rgba(249,115,22,0.6)]">
							🧾
						</span>
						<span>Attività & log</span>
					</h3>
					<div className="space-y-4 text-sm text-gray-600">
						{printProperty("Status Message", statusMessage || "-")}
						{printProperty("Last TX", lastTxHash ?? "-")}
						{printProperty("Handle", outstandingHandle ?? "N/A")}
					</div>
					<div className="mt-6 rounded-2xl border border-white/40 bg-white/55 p-5 text-xs text-gray-500 shadow-inner">
						Ogni transazione viene tracciata on-chain. Puoi aprire il Block Explorer per approfondire gas e conferme.
					</div>
				</div>
			</section>
		</div>
	);
};

type FieldProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	type?: string;
	inputMode?: "text" | "decimal" | "numeric";
	min?: string;
	step?: string;
	max?: string;
};

const Field = ({ label, value, onChange, placeholder, type = "text", inputMode, min, step, max }: FieldProps) => {
	return (
		<label className="flex flex-col space-y-2 text-gray-900">
			<span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</span>
			<input
				className="rounded-xl border border-white/40 bg-white/70 px-3 py-3 text-base text-gray-900 shadow-[0_8px_18px_-12px_rgba(15,23,42,0.35)] transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#ff9a64]"
				value={value}
				onChange={event => onChange(event.target.value)}
				placeholder={placeholder}
				type={type}
				inputMode={inputMode}
				min={min}
				step={step}
				max={max}
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
		<div className="flex items-center justify-between rounded-xl border border-white/35 bg-white/70 px-4 py-3 text-sm text-gray-700 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur-sm">
			<span className="font-semibold text-gray-600">{name}</span>
			<span className="ml-2 rounded-md border border-white/40 bg-white/80 px-3 py-1 font-mono text-xs font-semibold text-gray-900">
				{displayValue}
			</span>
		</div>
	);
}

function printBooleanProperty(name: string, value: boolean) {
	return (
		<div className="flex items-center justify-between rounded-xl border border-white/35 bg-white/70 px-4 py-3 text-sm text-gray-700 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur-sm">
			<span className="font-semibold text-gray-600">{name}</span>
			<span
				className={`rounded-md border px-3 py-1 font-mono text-xs font-semibold ${
					value
						? "border-emerald-300/60 bg-emerald-100/70 text-emerald-700"
						: "border-rose-300/60 bg-rose-100/70 text-rose-700"
				}`}
			>
				{value ? "✓ true" : "✗ false"}
			</span>
		</div>
	);
}

