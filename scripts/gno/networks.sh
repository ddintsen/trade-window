# Network table for the Trade Window scripts. Sourced, not executed.
# Every endpoint is an official gno.land one. Check
# https://github.com/gnolang/gno/blob/chain/mainnet/docs/resources/gnoland-networks.md
# before deploying: testnets rotate.

network_config() {
  case "${1:-onyx}" in
    onyx)
      CHAIN_ID=onyx-1
      REMOTE=https://rpc.onyx.testnets.gno.land:443
      GNOWEB=https://onyx.testnets.gno.land
      ;;
    mainnet)
      CHAIN_ID=gnoland-1
      REMOTE=https://rpc.gno.land:443
      GNOWEB=https://gno.land
      ;;
    local)
      CHAIN_ID=dev
      REMOTE=http://127.0.0.1:26657
      GNOWEB=http://127.0.0.1:8888
      ;;
    *)
      echo "unknown network '$1': use onyx, mainnet or local" >&2
      return 1
      ;;
  esac
}
