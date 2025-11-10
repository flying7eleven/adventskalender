import { useEffect, useState } from 'react';
import { API_BACKEND_URL, VersionInformation, MAX_WINNERS_PER_DAY } from '../../api';
import packageJson from '../../../package.json';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LocalizedText } from '../../components/LocalizedText';
import { VersionInformationSchema, AuditEventCountSchema } from '../../schemas';

export const VersionView = () => {
    const [backendVersionInformation, setBackendVersionInformation] = useState<VersionInformation>({
        backend_version: 'unknown',
        backend_arch: 'unknown',
        rustc_version: 'unknown',
        build_date: 'unknown',
        build_time: 'unknown',
    });
    const [auditEventCount, setAuditEventCount] = useState<number>(0);

    const getFrontendBuildDateTimeString = () => {
        return __BUILD_DATE__;
    };

    useEffect(() => {
        // get the version information from the backend
        fetch(`${API_BACKEND_URL}/version`, {
            method: 'GET',
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => {
                // if we got a valid response from the backend, it should be JSON. We can convert it to a valid JSON
                // object and proceed processing it
                if (res.status === 200) {
                    return res.json();
                }
            })
            .then((data) => {
                // Validate the response data using Zod schema
                const validated = VersionInformationSchema.parse(data);
                setBackendVersionInformation(validated);
            })
            .catch((error) => {
                // Log validation errors for debugging
                if (error?.name === 'ZodError') {
                    console.error('API response validation failed:', error);
                }
                /* we do not have to anything here */
            });
    }, []);

    useEffect(() => {
        // get the audit event count from the backend
        fetch(`${API_BACKEND_URL}/audit/count`, {
            method: 'GET',
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => {
                // if we got a valid response from the backend, it should be JSON. We can convert it to a valid JSON
                // object and proceed processing it
                if (res.status === 200) {
                    return res.json();
                }
            })
            .then((data) => {
                // Validate the response data using Zod schema
                const validated = AuditEventCountSchema.parse(data);
                setAuditEventCount(validated.count);
            })
            .catch((error) => {
                // Log validation errors for debugging
                if (error?.name === 'ZodError') {
                    console.error('API response validation failed:', error);
                }
                /* we do not have to anything here */
            });
    }, []);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-4 p-4">
                <Card className="w-full max-w-2xl">
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2">
                                <p className="text-sm font-medium text-left">
                                    <LocalizedText translationKey={'version.card.headline'} />
                                </p>
                            </div>
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.frontend_version'} />
                                </p>
                                <p className="text-base text-right">{packageJson.version}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.backend_version'} />
                                </p>
                                <p className="text-base text-right">{backendVersionInformation.backend_version}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.backend_arch'} />
                                </p>
                                <p className="text-base text-right">{backendVersionInformation.backend_arch}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.backend_rustc_version'} />
                                </p>
                                <p className="text-base text-right">{backendVersionInformation.rustc_version}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.frontend_build_date_time'} />
                                </p>
                                <p className="text-base text-right">{`${getFrontendBuildDateTimeString()}`}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'version.card.categories.backend_build_date_time'} />
                                </p>
                                <p className="text-base text-right">{`${backendVersionInformation.build_date} ${backendVersionInformation.build_time}`}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="w-full max-w-2xl">
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2">
                                <p className="text-sm font-medium text-left">
                                    <LocalizedText translationKey={'configuration.card.headline'} />
                                </p>
                            </div>
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'configuration.card.categories.used_backend_base_url'} />
                                </p>
                                <p className="text-base text-right">{API_BACKEND_URL}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'configuration.card.categories.number_of_audit_events'} />
                                </p>
                                <p className="text-base text-right">{auditEventCount}</p>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2">
                                <p className="text-base text-left">
                                    <LocalizedText translationKey={'configuration.card.categories.max_winners_per_day'} />
                                </p>
                                <p className="text-base text-right">{MAX_WINNERS_PER_DAY}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <p className="text-xs font-medium text-center">
                <span dangerouslySetInnerHTML={{ __html: 'Crafted with &#10084; in Düsseldorf.&nbsp;' }} />
                Get the source code at{' '}
                <a href={'https://github.com/flying7eleven/adventskalender'} target={'_blank'} rel="noreferrer" className="text-primary hover:underline">
                    GitHub
                </a>
                .
            </p>
        </div>
    );
};
