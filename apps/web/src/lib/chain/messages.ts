// Transaction messages in the shape Adena's DoContract expects.

export interface CallMessage {
  type: "/vm.m_call";
  value: {
    caller: string;
    send: string;
    max_deposit: string;
    pkg_path: string;
    func: string;
    args: string[];
  };
}

export function call(caller: string, pkgPath: string, func: string, args: (string | number | bigint)[] = [], send = ""): CallMessage {
  return {
    type: "/vm.m_call",
    value: {
      caller,
      send,
      max_deposit: "",
      pkg_path: pkgPath,
      func,
      args: args.map((a) => String(a)),
    },
  };
}

export interface AddPackageMessage {
  type: "/vm.m_addpkg";
  value: {
    creator: string;
    package: { name: string; path: string; files: { name: string; body: string }[] };
    send: string;
    max_deposit: string;
  };
}

export type TxMessage = CallMessage | AddPackageMessage;

/**
 * Publishes a package. The chain rewrites gnomod.toml's module line to the
 * path, so the repository's own gnomod.toml goes as it is. maxDeposit caps the
 * storage deposit the creator locks for the code.
 */
export function addPackage(creator: string, path: string, files: { name: string; body: string }[], maxDeposit: string): AddPackageMessage {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return {
    type: "/vm.m_addpkg",
    value: { creator, package: { name, path, files: files.map((f) => ({ name: f.name, body: f.body })) }, send: "", max_deposit: maxDeposit },
  };
}

/** The realm that owns a GRC20 registry key: "gno.land/r/x/tok.SYM" -> "gno.land/r/x/tok". */
export function tokenRealm(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot > key.lastIndexOf("/") ? key.slice(0, dot) : key;
}
