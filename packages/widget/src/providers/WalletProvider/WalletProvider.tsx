import type { Web3Provider } from '@ethersproject/providers';
import type { StaticToken } from '@lifi/sdk';
import type { ExtendedWalletClient } from '@lifi/wallet-management';
import {
  LiFiWalletManagement,
  readActiveWallets,
  supportedWallets,
  addChain as walletAgnosticAddChain,
  switchChainAndAddToken as walletAgnosticAddToken,
  switchChain as walletAgnosticSwitchChain,
} from '@lifi/wallet-management';
import type { FC, PropsWithChildren } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useWidgetConfig } from '../WidgetProvider';
import type { WalletAccount, WalletContextProps } from './types';
import type { Signer } from '@ethersproject/abstract-signer';

const liFiWalletManagement = new LiFiWalletManagement();

const stub = (): never => {
  throw new Error(
    `You forgot to wrap your component in <${WalletProvider.name}>.`,
  );
};

const initialContext: WalletContextProps = {
  connect: stub,
  disconnect: stub,
  switchChain: stub,
  addChain: stub,
  addToken: stub,
  account: {},
};

const WalletContext = createContext<WalletContextProps>(initialContext);

export const useWallet = (): WalletContextProps => useContext(WalletContext);

export const WalletProvider: FC<PropsWithChildren> = ({ children }) => {
  const { walletManagement } = useWidgetConfig();
  const [account, setAccount] = useState<WalletAccount>({});
  const [currentWallet, setCurrentWallet] = useState<
    ExtendedWalletClient | undefined
  >();

  useEffect(() => {
    console.log(account);
  }, [account.chainId, account.address, account.isActive]);

  useEffect(() => {}, [currentWallet]);

  // useEffect(() => {
  //   const autoConnect = async () => {
  //     const persistedActiveWallets = readActiveWallets();
  //     const activeWallets = supportedWallets.filter((wallet) =>
  //       persistedActiveWallets.some(
  //         (perstistedWallet) => perstistedWallet.name === wallet.name,
  //       ),
  //     );
  //     if (!activeWallets.length) {
  //       return;
  //     }
  //     await liFiWalletManagement.autoConnect(activeWallets);
  //     activeWallets[0].on('walletAccountChanged', handleWalletUpdate);
  //     handleWalletUpdate(activeWallets[0]);
  //   };
  //   autoConnect();
  // }, []);

  const handleWalletUpdate = async (wallet?: ExtendedWalletClient) => {
    setCurrentWallet(wallet);
    const account = await extractAccountFromExtendedClient(wallet);
    setAccount(account);
  };

  const connect = useCallback(
    async (wallet: ExtendedWalletClient) => {
      if (walletManagement) {
        await walletManagement.connect();
        const account = await extractAccountFromExtendedClient(wallet);
        setAccount(account);
        return;
      }
      await liFiWalletManagement.connect(wallet);
      // wallet.on('walletAccountChanged', handleWalletUpdate);
      console.log('Widget.WalletProvider.connect', wallet);
      handleWalletUpdate(wallet);
    },
    [walletManagement],
  );

  const disconnect = useCallback(async () => {
    if (walletManagement) {
      await walletManagement.disconnect();
      setAccount({});
      return;
    }
    if (currentWallet) {
      await liFiWalletManagement.disconnect(currentWallet);
      // currentWallet.removeAllListeners();
      handleWalletUpdate(undefined);
    }
  }, [walletManagement, currentWallet]);

  const switchChain = useCallback(
    async (chainId: number) => {
      try {
        if (walletManagement?.switchChain) {
          const signer = await walletManagement.switchChain(chainId);
          const account = await extractAccountFromExtendedClient(signer);
          setAccount(account);
        } else if (!currentWallet) {
          const provider = account.signer?.provider as Web3Provider;
          if (!provider) {
            throw new Error(`Switch chain: No provider available`);
          }
          await walletAgnosticSwitchChain(provider, chainId);
        } else {
          await currentWallet?.switchChain(chainId);
          handleWalletUpdate(currentWallet);
        }
        return true;
      } catch {
        return false;
      }
    },
    [walletManagement, currentWallet, account?.signer?.provider],
  );

  const addChain = useCallback(
    async (chainId: number) => {
      try {
        if (walletManagement?.addChain) {
          return walletManagement.addChain(chainId);
        } else if (!currentWallet) {
          const provider = account.signer?.provider as Web3Provider;
          if (!provider) {
            throw new Error(`Add chain: No provider available`);
          }
          await walletAgnosticAddChain(provider, chainId);
        } else {
          await currentWallet?.addChain(chainId);
          handleWalletUpdate(currentWallet);
        }

        return true;
      } catch {
        return false;
      }
    },
    [walletManagement, currentWallet, account?.signer?.provider],
  );

  const addToken = useCallback(
    async (chainId: number, token: StaticToken) => {
      try {
        if (walletManagement?.addToken) {
          return walletManagement.addToken(token, chainId);
        } else if (!currentWallet) {
          const provider = account.signer?.provider as Web3Provider;
          if (!provider) {
            throw new Error(`Add token: No provider available`);
          }
          await walletAgnosticAddToken(provider, chainId, token);
        } else {
          await currentWallet?.addToken(chainId, token);
          handleWalletUpdate(currentWallet);
        }
      } catch {}
    },
    [walletManagement, currentWallet, account?.signer?.provider],
  );

  // keep widget in sync with changing external signer object
  useEffect(() => {
    if (walletManagement) {
      const updateAccount = async () => {
        const account = await extractAccountFromExtendedClient(
          walletManagement?.signer,
        );
        setAccount(account);
      };
      updateAccount();
    }
  }, [walletManagement, walletManagement?.signer]);

  const value = useMemo(
    () => ({
      connect,
      disconnect,
      switchChain,
      addChain,
      addToken,
      account,
    }),
    [account, addChain, addToken, connect, disconnect, switchChain],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export const extractAccountFromExtendedClient = async (
  extendedClient?: ExtendedWalletClient,
) => {
  try {
    const address = (await extendedClient?.getAddresses())?.[0];
    return {
      address: address,
      isActive: !!address,
      signer: extendedClient as unknown as Signer,
      chainId: await extendedClient?.getChainId(),
    };
  } catch (error) {
    console.error(error);
    return {};
  }
};
