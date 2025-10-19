"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../components/LanguageProvider";
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
}

	export default function FHEDebtRegistry() {
	// ---- ALL LOGIC BELOW IS NOW INSIDE THE COMPONENT ----

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

		const { isConnected, chain, address } = useAccount();
		const { user } = useUser();
		const { t } = useLanguage();

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
			<label className="flex flex-col space-y-2 text-sky-950">
				<span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-800">{label}</span>
				<input
					className="rounded-xl border border-sky-100/60 bg-sky-50/80 px-3 py-3 text-base text-sky-950 shadow-[0_8px_18px_-12px_rgba(7,89,133,0.35)] transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-200"
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
		" bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600 text-sky-950 shadow-[0_12px_24px_-12px_rgba(56,189,248,0.75)] " +
		"hover:scale-[1.03] focus-visible:ring-sky-200";
	const secondaryButtonClass =
		buttonClass +
		" border border-sky-100/60 bg-sky-50/80 text-sky-900 shadow-[0_8px_20px_-10px_rgba(12,74,110,0.25)] backdrop-blur-md " +
		"hover:bg-sky-50 focus-visible:ring-sky-200";
	const subtleButtonClass =
		"inline-flex items-center justify-center rounded-lg border border-sky-100/60 bg-sky-50/80 px-3 py-1 text-xs font-semibold text-sky-800 " +
		"shadow-[0_4px_12px_-6px_rgba(12,74,110,0.35)] transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200";

	const titleClass = "mb-6 flex items-center gap-3 text-xl font-bold text-sky-950";
	const sectionClass =
		"rounded-2xl border border-sky-100/40 bg-sky-50/80 p-8 text-sky-900 shadow-[0_30px_60px_-35px_rgba(7,89,133,0.45)] backdrop-blur-2xl";
	const todayIso = useMemo(() => toDateInputValue(new Date()), []);

	if (!user) {
		return (
			<div className="max-w-[92rem] mx-auto p-6 text-sky-950">
				<div className="flex items-center justify-center">
					<div className="rounded-3xl border border-sky-200/60 bg-sky-50/90 p-8 text-center shadow-[0_25px_50px_-20px_rgba(14,116,144,0.35)]">
						<div className="mb-4">
							<span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-sky-200/60 text-3xl text-sky-900">
								⚠️
							</span>
						</div>
						<h2 className="mb-2 text-2xl font-extrabold text-sky-950">{t("debtRegistry.civicSessionRequired")}</h2>
						<p className="text-sky-900/70">{t("debtRegistry.signInWithCivic")}</p>
					</div>
				</div>
			</div>
		);
	}

	if (!isConnected) {
		return (
			<div className="max-w-[92rem] mx-auto p-6 text-sky-950">
				<div className="flex items-center justify-center">
					<div className="rounded-3xl border border-sky-200/60 bg-sky-50/90 p-8 text-center shadow-[0_25px_50px_-20px_rgba(14,116,144,0.35)]">
						<div className="mb-4">
							<span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-sky-200/60 text-3xl text-sky-900">
								⚠️
							</span>
						</div>
						<h2 className="mb-2 text-2xl font-extrabold text-sky-950">{t("debtRegistry.walletNotConnected")}</h2>
						<p className="text-sky-900/70">{t("debtRegistry.connectWalletCivic")}</p>
					</div>
				</div>
			</div>
		);
	}


	return (
		<div className="relative mx-auto flex min-h-[80vh] w-full max-w-[92rem] flex-col gap-8 px-8 py-10 text-sky-950">
			<div className="absolute inset-0 -z-10 overflow-hidden rounded-[36px] bg-gradient-to-br from-sky-100 via-sky-200 to-sky-300 shadow-[0_40px_120px_-40px_rgba(14,165,233,0.4)]" />
			<div className="absolute inset-0 -z-10 rounded-[36px] bg-[radial-gradient(circle_at_top,_rgba(186,230,253,0.45),_transparent_48%),_radial-gradient(circle_at_bottom,_rgba(125,211,252,0.35),_transparent_60%)]" />
			<header className="relative rounded-3xl border border-sky-200/60 bg-sky-50/90 p-10 text-sky-900 shadow-[0_25px_60px_-20px_rgba(14,165,233,0.25)] backdrop-blur-xl">
				<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<div className="space-y-3">
						<span className="inline-flex items-center rounded-full bg-sky-200/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-900">
							{t("debtRegistry.civicReady")}
						</span>
						<h1 className="text-4xl font-semibold tracking-tight text-sky-950 sm:text-5xl">{t("debtRegistry.title")}</h1>
						<p className="max-w-2xl text-base text-sky-800/80">
							{t("debtRegistry.intro")}
						</p>
					</div>
					<div className="rounded-2xl border border-sky-200/60 bg-sky-100/70 px-6 py-4 text-sm text-sky-900">
						<div className="text-sky-800/80">{t("debtRegistry.walletConnected")}</div>
						<div className="mt-3 rounded-xl border border-sky-200/50 bg-sky-50/90 p-3">
							<Address address={isConnected ? address : undefined} />
						</div>
						<p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-sky-700/80">{t("debtRegistry.civicSessionRequiredNote")}</p>
					</div>
				</div>
			</header>

			<section className="relative grid gap-8 lg:grid-cols-2">
				<div className={sectionClass}>
								<h3 className={titleClass}>
									<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-300 to-sky-500 text-2xl text-sky-950 shadow-[0_12px_30px_-16px_rgba(56,189,248,0.55)]">
										📄
									</span>
									<span>{t("debtRegistry.newDebt.title")}</span>
								</h3>
								<p className="mb-6 text-sm text-sky-900/70">
									{t("debtRegistry.newDebt.description")}
								</p>
					<div className="mb-6 rounded-2xl border border-sky-100/50 bg-sky-50/85 p-5 shadow-[0_18px_36px_-24px_rgba(7,89,133,0.35)]">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div>
												<p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-800">{t("debtRegistry.confidentialTokenBalance")}</p>
								<div className="mt-2 text-3xl font-extrabold text-sky-950">{walletBalanceDisplay}</div>
												<p className="mt-2 text-xs text-sky-800/80">
													{t("debtRegistry.confidentialTokenBalanceNote")}
												</p>
							</div>
							<span className="inline-flex items-center rounded-lg border border-sky-100/50 bg-sky-50/80 px-3 py-1 font-mono text-[11px] font-semibold text-sky-800">
								{walletBalanceHandleDisplay}
							</span>
						</div>
						<div className="mt-4 flex flex-wrap items-center gap-3">
											<button
												className={`${subtleButtonClass} px-4 py-2 text-sm`}
												onClick={refreshWalletBalance}
												disabled={isFetchingBalance || !confidentialToken?.address}
											>
												{isFetchingBalance ? t("debtRegistry.updating") : t("debtRegistry.refreshBalance")}
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
												{isDecrypting ? t("debtRegistry.decrypting") : t("debtRegistry.decryptAmounts")}
											</button>
											{showBalanceDecryptHint && (
												<span className="text-xs font-semibold text-sky-800">
													{t("debtRegistry.approveSignatureToDecrypt")}
												</span>
											)}
						</div>
					</div>
					<div className="grid gap-5 md:grid-cols-2">
										<Field label={t("debtRegistry.fields.debtReference")}
											value={createRef}
											onChange={setCreateRef}
											placeholder={t("debtRegistry.fields.debtReferencePlaceholder")}
										/>
										<Field label={t("debtRegistry.fields.creditorAddress")}
											value={createCreditor}
											onChange={setCreateCreditor}
											placeholder={t("debtRegistry.fields.creditorAddressPlaceholder")}
										/>
										<Field label={t("debtRegistry.fields.amount")}
											value={createAmount}
											onChange={setCreateAmount}
											placeholder={t("debtRegistry.fields.amountPlaceholder")}
											inputMode="numeric"
										/>
										<Field label={t("debtRegistry.fields.dueDate")}
											value={createDueDate}
											onChange={setCreateDueDate}
											type="date"
											min={todayIso}
										/>
					</div>
					<div className="mt-6 flex flex-wrap items-center gap-4">
										<button
											className={primaryButtonClass}
											onClick={handleCreateDebt}
											disabled={isSubmittingTx || !fhevmInstance || !debtRegistry?.address}
										>
											{isSubmittingTx ? t("debtRegistry.processing") : t("debtRegistry.createNewDebt")}
										</button>
										<span className="rounded-full bg-sky-900/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
											{t("debtRegistry.debtId")} {createDebtId ?? t("debtRegistry.pending")}
										</span>
					</div>
				</div>
				<div className={sectionClass}>
								<h3 className={titleClass}>
									<span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-300 to-sky-500 text-2xl text-sky-950 shadow-[0_12px_30px_-16px_rgba(56,189,248,0.55)]">
										💸
									</span>
									<span>{t("debtRegistry.manageDebt.title")}</span>
								</h3>
								<p className="mb-6 text-sm text-sky-900/70">
									{t("debtRegistry.manageDebt.description")}
								</p>
					<div className="grid gap-5 md:grid-cols-2">
										<Field label={t("debtRegistry.fields.debtReference")}
											value={lookupRef}
											onChange={setLookupRef}
											placeholder={t("debtRegistry.fields.debtReferencePlaceholder")}
										/>
										<Field label={t("debtRegistry.fields.paymentAmount")}
											value={paymentAmount}
											onChange={setPaymentAmount}
											placeholder={t("debtRegistry.fields.paymentAmountPlaceholder")}
											inputMode="numeric"
										/>
					</div>
					<div className="mt-6 flex flex-wrap gap-4">
										<button className={secondaryButtonClass} onClick={() => lookupDebtId && refreshDebt(lookupDebtId)} disabled={!lookupDebtId || isFetchingDebt}>
											{isFetchingDebt ? t("debtRegistry.fetching") : t("debtRegistry.refreshStatus")}
										</button>
										<button className={secondaryButtonClass} onClick={handlePayDebt} disabled={!lookupDebtId || isSubmittingTx}>
											{isSubmittingTx ? t("debtRegistry.processing") : t("debtRegistry.sendRepayment")}
										</button>
										<button className={secondaryButtonClass} onClick={decrypt} disabled={!canDecrypt || isDecrypting}>
											{isDecrypting ? t("debtRegistry.decrypting") : t("debtRegistry.decryptAmounts")}
										</button>
					</div>
					{debtView && (
						<div className="mt-8 rounded-2xl border border-sky-100/45 bg-sky-50/70 p-6 shadow-inner">
											<h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-sky-800">{t("debtRegistry.currentDetails")}</h4>
							<div className="grid gap-3">
												{printProperty(t("debtRegistry.debtor"), debtView.debtor)}
												{printProperty(t("debtRegistry.creditor"), debtView.creditor)}
												{printProperty(t("debtRegistry.dueDate"), `${debtView.dueDate} (${new Date(Number(debtView.dueDate) * 1000).toLocaleString()})`)}
												{printBooleanProperty(t("debtRegistry.closed"), debtView.closed)}
												{printProperty(t("debtRegistry.encryptedAmount"), outstandingHandle ?? "-")}
												{printProperty(
													t("debtRegistry.decryptedOutstanding"),
													typeof decryptedOutstanding !== "undefined" ? decryptedOutstanding.toString() : t("debtRegistry.notDecrypted"),
												)}
												{printProperty(t("debtRegistry.activeDebtId"), activeDebtId ?? "-")}
							</div>
						</div>
					)}
				</div>
			</section>
		</div>
	);



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
		<div className="flex items-center justify-between rounded-xl border border-sky-100/45 bg-sky-50/80 px-4 py-3 text-sm text-sky-900/80 shadow-[0_10px_24px_-18px_rgba(7,89,133,0.35)] backdrop-blur-sm">
			<span className="font-semibold text-sky-800">{name}</span>
			<span className="ml-2 rounded-md border border-sky-100/50 bg-sky-50/90 px-3 py-1 font-mono text-xs font-semibold text-sky-950">
				{displayValue}
			</span>
		</div>
	);
}

function printBooleanProperty(name: string, value: boolean) {
	return (
		<div className="flex items-center justify-between rounded-xl border border-sky-100/45 bg-sky-50/80 px-4 py-3 text-sm text-sky-900/80 shadow-[0_10px_24px_-18px_rgba(7,89,133,0.35)] backdrop-blur-sm">
			<span className="font-semibold text-sky-800">{name}</span>
			<span
				className={`rounded-md border px-3 py-1 font-mono text-xs font-semibold ${
					value
						? "border-sky-300/60 bg-sky-100/80 text-sky-700"
						: "border-rose-300/60 bg-rose-100/70 text-rose-700"
				}`}
			>
				{value ? "✓ true" : "✗ false"}
			</span>
		</div>
	);
}
}
