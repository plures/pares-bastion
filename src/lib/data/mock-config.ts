import type { ConfigBackup, DiffResult } from '$lib/types/config.types.js';

export const mockBackups: ConfigBackup[] = [
	{
		hostname: 'core-rtr-01',
		version: 'v3',
		timestamp: '2026-03-26T08:00:00Z',
		size: 4096
	},
	{
		hostname: 'core-rtr-01',
		version: 'v2',
		timestamp: '2026-03-20T14:30:00Z',
		size: 3980
	},
	{
		hostname: 'core-rtr-01',
		version: 'v1',
		timestamp: '2026-03-10T09:15:00Z',
		size: 3840
	},
	{
		hostname: 'core-rtr-02',
		version: 'v2',
		timestamp: '2026-03-25T11:45:00Z',
		size: 4200
	},
	{
		hostname: 'core-rtr-02',
		version: 'v1',
		timestamp: '2026-03-15T16:20:00Z',
		size: 4050
	},
	{
		hostname: 'edge-rtr-01',
		version: 'v2',
		timestamp: '2026-03-24T07:00:00Z',
		size: 5120
	},
	{
		hostname: 'edge-rtr-01',
		version: 'v1',
		timestamp: '2026-03-12T10:30:00Z',
		size: 4980
	},
	{
		hostname: 'spine-sw-01',
		version: 'v1',
		timestamp: '2026-03-22T13:00:00Z',
		size: 3200
	},
	{
		hostname: 'leaf-sw-01',
		version: 'v1',
		timestamp: '2026-03-21T09:00:00Z',
		size: 2800
	}
];

/** Mock config content keyed by "hostname:version". */
export const mockConfigContent: Record<string, string> = {
	'core-rtr-01:v3': `! Configuration for core-rtr-01
!
version 16.9
!
hostname core-rtr-01
!
interface GigabitEthernet0/0/0
 ip address 10.0.0.1 255.255.255.0
 no shutdown
!
interface GigabitEthernet0/0/1
 ip address 10.0.1.1 255.255.255.0
 no shutdown
!
router bgp 65001
 neighbor 10.0.0.2 remote-as 65001
 neighbor 192.168.1.1 remote-as 65002
 neighbor 172.16.0.1 remote-as 65003
!
ip route 0.0.0.0 0.0.0.0 10.0.0.254
!
end`,
	'core-rtr-01:v2': `! Configuration for core-rtr-01
!
version 16.9
!
hostname core-rtr-01
!
interface GigabitEthernet0/0/0
 ip address 10.0.0.1 255.255.255.0
 no shutdown
!
router bgp 65001
 neighbor 10.0.0.2 remote-as 65001
 neighbor 192.168.1.1 remote-as 65002
!
ip route 0.0.0.0 0.0.0.0 10.0.0.254
!
end`,
	'core-rtr-01:v1': `! Configuration for core-rtr-01
!
version 16.9
!
hostname core-rtr-01
!
interface GigabitEthernet0/0/0
 ip address 10.0.0.1 255.255.255.0
 no shutdown
!
router bgp 65001
 neighbor 10.0.0.2 remote-as 65001
!
end`
};

export const mockDiff: DiffResult = {
	hostname: 'core-rtr-01',
	versionA: 'v2',
	versionB: 'v3',
	unified: `--- core-rtr-01 v2
+++ core-rtr-01 v3
@@ -8,6 +8,9 @@
  ip address 10.0.0.1 255.255.255.0
  no shutdown
 !
+interface GigabitEthernet0/0/1
+ ip address 10.0.1.1 255.255.255.0
+ no shutdown
+!
 router bgp 65001
  neighbor 10.0.0.2 remote-as 65001
  neighbor 192.168.1.1 remote-as 65002
+ neighbor 172.16.0.1 remote-as 65003
 !
 ip route 0.0.0.0 0.0.0.0 10.0.0.254
 !`,
	additions: 5,
	deletions: 0
};
